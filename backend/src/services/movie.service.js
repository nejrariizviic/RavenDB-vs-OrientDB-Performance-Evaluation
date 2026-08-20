const ravenDbService = require("./ravendb.service");
const orientDbService = require("./orientdb.service");

/**
 * Servisni sloj za rad sa MovieLens podacima (filmovi i ocjene).
 * Za svaki upit postoji paralelna implementacija nad RavenDB i OrientDB bazom,
 * kako bi se omogućilo benchmark poređenje performansi između dvije baze.
 *
 * PRETPOSTAVLJENA ŠEMA PODATAKA (prilagoditi nazive kolekcija/klasa i polja
 * ako se u tvom importu MovieLens dataset-a razlikuju):
 *
 *   RavenDB kolekcija "Movies"  -> { movieId, title, genres }
 *                                  dokument ID po konvenciji: "movies/{movieId}"
 *   RavenDB kolekcija "Ratings" -> { movieId, userId, rating, timestamp }
 *   RavenDB kolekcija "Tags"    -> { movieId, userId, tag, timestamp }
 *   RavenDB kolekcija "Users"   -> { userId }
 *
 *   OrientDB klasa "Movie"  -> { movieId, title, genres }
 *   OrientDB klasa "Rating" -> { movieId, userId, rating, timestamp }
 *   OrientDB klasa "Tag"    -> { movieId, userId, tag, timestamp }
 *   OrientDB klasa "User"   -> { userId }
 *
 * NAPOMENA (Tags): baš kao ni Ratings, ni Tags dokumenti/zapisi nemaju
 * jednoznačan poslovni ključ nalik movieId-u kod filmova - isti korisnik
 * može istom filmu dodati VIŠE različitih tagova, pa se jedan konkretan
 * tag zapis jednoznačno identifikuje TROJKOM (userId, movieId, tag) - vidi
 * ravenDeleteTag / orientDeleteTag niže.
 *
 * Ako je u tvom modelu ID RavenDB dokumenta drugačiji (npr. auto-generisan
 * "movies/1-A"), ravenGetMovieById treba zamijeniti sa upitom po polju
 * movieId (whereEquals), umjesto direktnog session.load().
 */

/**
 * Ograničava (clamp) ocjenu na validan MovieLens opseg [0.5, 5.0] nakon
 * primjene korekcije (delta). Zajednička helper funkcija za RavenDB i
 * OrientDB granu korekcije ocjena (vidi ravenCorrectActiveUsersRatings /
 * orientCorrectActiveUsersRatings niže).
 *
 * @param {number} value
 * @returns {number}
 */
function clampRating(value) {
  return Math.min(5, Math.max(0.5, value));
}

// ==========================================
// RAVENDB
// ==========================================

/**
 * JEDNOSTAVAN GET UPIT
 * Pronalazi film po ID-u - direktan load dokumenta po ključu (najbrža
 * moguća operacija u RavenDB, bez prolaska kroz query engine/indeks).
 *
 * @param {number|string} movieId
 * @returns {Promise<object|null>}
 */
async function ravenGetMovieById(movieId) {
  const session = ravenDbService.openSession();
  try {
    return await session.load(`movies/${movieId}`);
  } finally {
    session.dispose();
  }
}

/**
 * SLOŽEN GET UPIT
 * Top N filmova po prosječnoj ocjeni, uz minimalan broj ocjena (HAVING-like
 * filter). Izvodi se u tri koraka:
 *   1) RQL "group by" agregacija nad kolekcijom Ratings - sum(rating) i count()
 *      po filmu (RavenDB dinamički group by upiti podržavaju SAMO count() i
 *      sum() kao agregacione funkcije; avg()/min()/max() NISU podržani, pa se
 *      ne mogu koristiti ni u select ni u order by dijelu ad-hoc RQL upita)
 *   2) Prosječna ocjena (sum/count) se izračuna i sortira u JS-u, jer RavenDB
 *      ne dozvoljava order by po izračunatoj/kompozitnoj vrijednosti unutar
 *      group by upita
 *   3) Batch load odgovarajućih Movie dokumenata (session.load sa nizom ID-jeva)
 *      samo za konačnih top N filmova
 *
 * @param {number} limit - broj filmova koje treba vratiti (default 10)
 * @param {number} minRatings - minimalan broj ocjena da bi film ušao u rezultat (default 50)
 * @returns {Promise<Array<{movieId:number, title:string, genres:*, avgRating:number, ratingCount:number}>>}
 */
async function ravenGetTopRatedMovies(limit = 10, minRatings = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const safeMinRatings = Math.max(0, Number(minRatings) || 50);

  const session = ravenDbService.openSession();
  try {
    const stats = await session.advanced
      .rawQuery(
        `from Ratings
         group by movieId
         where count() >= $minRatings
         select movieId, sum(rating) as ratingSum, count() as ratingCount`
      )
      .addParameter("minRatings", safeMinRatings)
      // Isti razlog kao u ravenCorrectActiveUsersRatings (vidi opširniji
      // komentar tamo) - "group by" RQL upit ide preko auto-indeksa koji se
      // gradi asinhrono, pa bez ovoga upit povremeno može vratiti
      // nepotpunu/staru listu filmova umjesto da sačeka tačan rezultat.
      .waitForNonStaleResults()
      .all();

    if (!stats.length) {
      return [];
    }

    // Prosjek i sortiranje/odsijecanje na top N rade se ovdje (u JS-u),
    // jer to RavenDB group by RQL ne podržava nativno.
    const topStats = stats
      .map((s) => ({
        movieId: s.movieId,
        avgRating: s.ratingSum / s.ratingCount,
        ratingCount: s.ratingCount,
      }))
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, safeLimit);

    const movieDocIds = topStats.map((s) => `movies/${s.movieId}`);
    const movies = await session.load(movieDocIds);

    return topStats.map((s) => {
      const movie = movies[`movies/${s.movieId}`];
      return {
        movieId: s.movieId,
        title: movie ? movie.title : null,
        genres: movie ? movie.genres : null,
        avgRating: Number(s.avgRating.toFixed(2)),
        ratingCount: s.ratingCount,
      };
    });
  } finally {
    session.dispose();
  }
}

// ==========================================
// JEDNOSTAVAN POST UPIT - dodaj novi film
// ==========================================

/**
 * Dodaje novi film u Movies kolekciju - direktan insert dokumenta po ključu
 * "movies/{movieId}" (ista konvencija ID-ja kao i kod ravenGetMovieById).
 *
 * Prije upisa provjerava da film sa istim movieId već ne postoji, kako bi se
 * spriječili duplikati (ažuriranje postojećeg filma je posebna PUT/PATCH
 * operacija, ne radi se ovdje).
 * Povratna vrijednost je status-objekat:
 *   - { status: "duplicate" }               -> film sa tim movieId već postoji
 *   - { status: "created", data: {...} }    -> uspješno upisano
 *
 * @param {{movieId:number, title:string, genres:*}} movie
 * @returns {Promise<{status:string, data?:object}>}
 */
async function ravenAddMovie(movie) {
  const { movieId, title, genres } = movie;
  const session = ravenDbService.openSession();
  try {
    const existingMovie = await session.load(`movies/${movieId}`);
    if (existingMovie) {
      return { status: "duplicate" };
    }

    const doc = { movieId: Number(movieId), title, genres };
    await session.store(doc, `movies/${movieId}`);
    // Bitno: običan JS objekat (bez klase) RavenDB automatski NE svrstava
    // u kolekciju "Movies" - bez ove linije dokument bi bio vidljiv samo
    // preko load-a po ID-u, ali ne i preko "from Movies" upita u Studio-u.
    session.advanced.getMetadataFor(doc)["@collection"] = "Movies";
    await session.saveChanges();
    return { status: "created", data: doc };
  } finally {
    session.dispose();
  }
}

// ==========================================
// SLOŽEN POST UPIT - dodaj ocjenu SAMO ako korisnik i film već postoje
// ==========================================

/**
 * Dodaje novu ocjenu (Rating) u Ratings kolekciju, ali samo ukoliko SVI
 * preduslovi budu ispunjeni:
 *   1) film sa datim movieId već postoji u Movies kolekciji
 *   2) korisnik sa datim userId već postoji u Users kolekciji
 *   3) korisnik još UVIJEK NIJE ocijenio taj film (par userId+movieId
 *      mora biti jedinstven - sprječava duplikate)
 *
 * Svi uslovi se provjeravaju u ISTOJ sesiji prije upisa (composite provjera).
 * Povratna vrijednost je status-objekat kako bi kontroler mogao razlikovati
 * "ne postoji" (404) od "već postoji ocjena" (409):
 *   - { status: "not_found" }              -> film ili korisnik ne postoje
 *   - { status: "duplicate" }               -> ocjena za taj par već postoji
 *   - { status: "created", data: {...} }    -> uspješno upisano
 *
 * @param {{userId:number, movieId:number, rating:number}} data
 * @returns {Promise<{status:string, data?:object}>}
 */
async function ravenAddRating(data) {
  const userId = Number(data.userId);
  const movieId = Number(data.movieId);
  const rating = Number(data.rating);

  const session = ravenDbService.openSession();
  try {
    const movie = await session.load(`movies/${movieId}`);
    if (!movie) {
      return { status: "not_found" };
    }

    const existingUser = await session
      .query({ collection: "Users" })
      .whereEquals("userId", userId)
      .first();
    if (!existingUser) {
      return { status: "not_found" };
    }

    const existingRating = await session
      .query({ collection: "Ratings" })
      .whereEquals("movieId", movieId)
      .whereEquals("userId", userId)
      .first();
    if (existingRating) {
      return { status: "duplicate" };
    }

    // Unix timestamp (sekunde) - ista konvencija kao originalni MovieLens
    // ratings.csv, umjesto ISO stringa (OrientDB Rating.timestamp je LONG).
    const doc = { userId, movieId, rating, timestamp: Math.floor(Date.now() / 1000) };
    await session.store(doc, "Ratings/");
    // Isti razlog kao kod ravenAddMovie - bez ovoga dokument ne bi bio
    // vidljiv preko "from Ratings" upita u Studio-u.
    session.advanced.getMetadataFor(doc)["@collection"] = "Ratings";
    await session.saveChanges();
    return { status: "created", data: doc };
  } finally {
    session.dispose();
  }
}

// ==========================================
// JEDNOSTAVAN PUT UPIT - izmijeni naslov filma po movieId
// ==========================================

/**
 * Izmjenjuje naslov postojećeg filma - učitava dokument po ključu
 * "movies/{movieId}" (ista konvencija kao ravenGetMovieById), izmijeni
 * polje title i sačuva promjenu.
 *
 * Dokument učitan preko session.load() je automatski "tracked" (praćen) od
 * strane sesije, pa je dovoljno izmijeniti polje na JS objektu i pozvati
 * saveChanges() - RavenDB sam detektuje razliku i šalje samo PATCH tog
 * jednog dokumenta na server.
 *
 * @param {number} movieId
 * @param {string} title
 * @returns {Promise<{status:string, data?:object}>}
 */
async function ravenUpdateMovieTitle(movieId, title) {
  const session = ravenDbService.openSession();
  try {
    const movie = await session.load(`movies/${movieId}`);
    if (!movie) {
      return { status: "not_found" };
    }

    movie.title = title;
    await session.saveChanges();

    return { status: "updated", data: movie };
  } finally {
    session.dispose();
  }
}

// ==========================================
// SLOŽEN PUT UPIT - korekcija ocjena za "aktivne" korisnike (>N ocjena)
// ==========================================

/**
 * Izvodi bulk korekciju ocjena za "aktivne" korisnike (korisnici koji su dali
 * STROGO VIŠE od minRatingsThreshold ocjena). Izvodi se u dva koraka:
 *   1) RQL "group by" agregacija nad kolekcijom Ratings po userId - isti
 *      idiom kao u ravenGetTopRatedMovies (count() u where/select dijelu
 *      dinamičkog group by upita), samo ovdje se traže "aktivni" korisnici
 *      umjesto najbolje ocijenjenih filmova.
 *   2) Ratings dokumenti tih korisnika ČIJA JE TRENUTNA OCJENA < 3 (poslovno
 *      pravilo iz zahtjeva - dižu se samo "niske" ocjene, whereIn "userId" +
 *      whereLessThan "rating") se učitavaju kao "tracked" entiteti u istoj
 *      sesiji; korekcija (+ delta) i clamp
 *      na opseg [0.5, 5.0] se rade u JS-u, a SVE promjene se šalju na
 *      server u JEDNOM saveChanges() pozivu (RavenDB Unit-of-Work batching
 *      - jedan HTTP zahtjev bez obzira na broj izmijenjenih dokumenata).
 *
 * @param {number} delta - vrijednost koja se dodaje svakoj ocjeni (može biti negativna)
 * @param {number} [minRatingsThreshold=100] - prag za "aktivnog" korisnika (STROGO >)
 * @param {number|null} [maxActiveUsers=null] - DEV/testing safeguard, vidi JSDoc kod
 *   orientCorrectActiveUsersRatings. Ovdje se primjenjuje u JS-u (sort + slice), poslije
 *   agregacije, iz istog razloga kao ravenGetTopRatedMovies (RavenDB RQL group-by upiti
 *   ne podržavaju ORDER BY po proizvoljnoj koloni unutar samog agregacionog upita).
 *   Sortirano po userId radi determinizma - isti korisnici pri ponovljenim pozivima,
 *   i isti skup kao kod OrientDB varijante za fer poređenje kad je limit uključen.
 * @returns {Promise<{status:string, activeUsersCount:number, updatedCount:number}>}
 */
async function ravenCorrectActiveUsersRatings(delta, minRatingsThreshold = 100, maxActiveUsers = null) {
  const session = ravenDbService.openSession();
  try {
    let activeUsers = await session.advanced
      .rawQuery(
        `from Ratings
         group by userId
         where count() > $minRatingsThreshold
         select userId, count() as ratingCount`
      )
      .addParameter("minRatingsThreshold", minRatingsThreshold)
      // VAŽNO: RavenDB "group by" RQL upite izvršava preko AUTO-INDEKSA koji
      // se grade ASINHRONO u pozadini. Bez eksplicitnog čekanja, PRVI put kad
      // se ovaj TAČAN oblik upita izvrši (ili poslije veće navale pisanja),
      // server zna vratiti NEPOTPUN/prazan rezultat dok indeks tek dostiže
      // trenutno stanje kolekcije - izgleda kao "nema aktivnih korisnika"
      // iako oni postoje (viđeno u praksi: isti zahtjev je prvi put vratio
      // activeUsersCount=0, a par trenutaka kasnije, kad je indeks uhvatio
      // korak, tačnih 10). .waitForNonStaleResults() garantuje TAČAN
      // rezultat pri SVAKOM pozivu - cijena je da PRVI poziv (dok se indeks
      // gradi) može potrajati duže, umjesto da vrati brz, ali pogrešan
      // odgovor. Za benčmark alat čija je svrha TAČNO mjerenje, ispravnost
      // ima prednost nad brzinom prvog (cold-start) poziva.
      // Eksplicitan timeout od 30s (umjesto defaultnih 15s) - kod "hladnog
      // starta" (npr. auto-indeks tek obrisan u Studio-u ili prvi put
      // izgrađen) samo 15s ponekad nije dovoljno da se auto-indeks izgradi
      // nad cijelom Ratings kolekcijom, pa je RavenDB Node.js klijent znao
      // baciti nejasnu grešku ("Cannot read properties of null (reading
      // 'toString')") umjesto čistog TimeoutException-a.
      .waitForNonStaleResults(30000)
      .all();

    if (!activeUsers.length) {
      return { status: "no_active_users", activeUsersCount: 0, updatedCount: 0 };
    }

    if (maxActiveUsers !== null && maxActiveUsers !== undefined) {
      const safeMaxActiveUsers = Math.max(1, Math.floor(Number(maxActiveUsers)));
      activeUsers = activeUsers
        .slice()
        .sort((a, b) => a.userId - b.userId)
        .slice(0, safeMaxActiveUsers);
    }

    const activeUserIds = activeUsers.map((u) => u.userId);

    const ratings = await session
      .query({ collection: "Ratings" })
      .whereIn("userId", activeUserIds)
      .whereLessThan("rating", 3)
      // ISTI razlog kao kod gornjeg group by upita: ovaj upit ide preko
      // SVOG SOPSTVENOG auto-indeksa (po userId + rating), različitog od
      // onog gore. Bez ovog čekanja, ako je taj auto-indeks tek u izgradnji
      // (npr. odmah poslije gornjeg upita, dok je indexing subsystem još
      // zauzet), upit zna vratiti nepotpun/prazan skup ocjena - izgledalo
      // je kao "0 izmjena" iako aktivni korisnici sa niskim ocjenama
      // stvarno postoje (vidjeno u praksi: FE je prikazivao 0, a Postman
      // pozvan malo kasnije, kad je indeks stigao, tačan broj).
      .waitForNonStaleResults(30000)
      .all();

    ratings.forEach((r) => {
      r.rating = clampRating(r.rating + delta);
    });

    await session.saveChanges();

    return {
      status: "corrected",
      activeUsersCount: activeUserIds.length,
      updatedCount: ratings.length,
    };
  } finally {
    session.dispose();
  }
}

// ==========================================
// JEDNOSTAVAN DELETE UPIT - obriši jedan tag zapis
// ==========================================

/**
 * Briše TAČNO JEDAN tag zapis iz Tags kolekcije - direktan whereEquals
 * lookup (bez agregacije/pod-upita) po trojki (userId, movieId, tag), koja
 * jednoznačno identifikuje jedan zapis (vidi napomenu o Tags šemi na vrhu
 * fajla). Ako zapis ne postoji, ništa se ne briše.
 *
 * VAŽNO: koristi se .firstOrNull() umjesto .first() - RavenDB Node.js
 * klijent (v7.x) kod .first() BACA InvalidOperationException
 * ("Expected at least one result.") ako upit ne vrati nijedan rezultat,
 * umjesto da vrati null. .firstOrNull() je "sigurna" varijanta koja
 * vraća null u tom slučaju, što nam ovdje treba za "not_found" granu.
 *
 * Povratna vrijednost je status-objekat:
 *   - { status: "not_found" }             -> tag zapis sa datom trojkom ne postoji
 *   - { status: "deleted", data: {...} }  -> uspješno obrisano
 *
 * @param {{userId:number, movieId:number, tag:string}} data
 * @returns {Promise<{status:string, data?:object}>}
 */
async function ravenDeleteTag(data) {
  const userId = Number(data.userId);
  const movieId = Number(data.movieId);
  const { tag } = data;

  const session = ravenDbService.openSession();
  try {
    const existingTag = await session
      .query({ collection: "Tags" })
      .whereEquals("userId", userId)
      .whereEquals("movieId", movieId)
      .whereEquals("tag", tag)
      .firstOrNull();

    if (!existingTag) {
      return { status: "not_found" };
    }

    session.delete(existingTag);
    await session.saveChanges();

    return { status: "deleted", data: existingTag };
  } finally {
    session.dispose();
  }
}

// ==========================================
// SLOŽEN DELETE UPIT - "orphan cleanup": obriši ocjene filmova bez ijednog taga
// ==========================================

/**
 * Briše ocjene (Ratings) filmova koji NEMAJU nijedan tag u Tags kolekciji.
 * Izvodi se u dva koraka:
 *   1) RQL "group by" upit nad Tags kolekcijom (isti idiom kao kod
 *      ravenGetTopRatedMovies/ravenCorrectActiveUsersRatings) da bi se
 *      dobio skup SVIH movieId vrijednosti koje IMAJU bar jedan tag.
 *   2) Ratings dokumenti čiji movieId NIJE u tom skupu (".not().whereIn()"
 *      - RavenDB negacija sljedeće where klauzule, ekvivalent "NOT IN")
 *      se učitavaju kao tracked entiteti (ograničeno na "limit" komada
 *      preko ".take()") i brišu se u JEDNOM saveChanges() pozivu.
 *
 * NAMJERNO OGRANIČENO na "limit" (podrazumijevano i maksimalno 10, vidi
 * movie.controller.js) obrisanih ocjena PO POZIVU, a ne odjednom svih -
 * filmova bez ijednog taga u MovieLens dataset-u ima jako mnogo, pa bi
 * neograničeno brisanje u jednom pozivu obrisalo ogromnu većinu Ratings
 * podataka odjednom. Endpoint je zamišljen da se po potrebi poziva više
 * puta (npr. iz skripte), dok se ne vrati deletedCount = 0.
 *
 * @param {number} limit - maksimalan broj ocjena za brisanje u ovom pozivu
 * @returns {Promise<{status:string, deletedCount:number}>}
 */
async function ravenDeleteOrphanMovieRatings(limit = 10) {
  const session = ravenDbService.openSession();
  try {
    const taggedStats = await session.advanced
      .rawQuery(`from Tags group by movieId select movieId`)
      // Isti razlog kao u ravenCorrectActiveUsersRatings (vidi opširniji
      // komentar tamo). Ovdje je posljedica staleness-a posebno podmukla:
      // lažno prazan rezultat bi značio da SVI filmovi (uključujući one koji
      // stvarno imaju tagove) ispadnu "orphan", pa bi se mogle obrisati
      // ocjene koje ne bi trebalo - .waitForNonStaleResults() to sprječava.
      .waitForNonStaleResults()
      .all();
    const taggedMovieIds = taggedStats.map((s) => s.movieId);

    // Ako baš NIJEDAN film u cijeloj bazi nema tag, ".not().whereIn()" sa
    // praznim nizom se preskače - u tom slučaju je SVAKI film "orphan", pa
    // se prosto uzima prvih "limit" zapisa iz cijele Ratings kolekcije.
    let query = session.query({ collection: "Ratings" });
    if (taggedMovieIds.length) {
      query = query.not().whereIn("movieId", taggedMovieIds);
    }

    const orphanRatings = await query.take(limit).all();

    if (!orphanRatings.length) {
      return { status: "no_orphans", deletedCount: 0 };
    }

    orphanRatings.forEach((rating) => session.delete(rating));
    await session.saveChanges();

    return { status: "deleted", deletedCount: orphanRatings.length };
  } finally {
    session.dispose();
  }
}

// ==========================================
// ORIENTDB
// ==========================================

/**
 * JEDNOSTAVAN GET UPIT
 * Pronalazi film po ID-u (indeksirano polje movieId).
 *
 * @param {number|string} movieId
 * @returns {Promise<object|null>}
 */
async function orientGetMovieById(movieId) {
  const session = await orientDbService.getOrientSession();
  try {
    const result = await session
      .query("SELECT FROM Movie WHERE movieId = :movieId LIMIT 1", {
        params: { movieId: Number(movieId) },
      })
      .all();

    return result[0] || null;
  } finally {
    await session.close().catch(() => {});
  }
}

/**
 * SLOŽEN GET UPIT
 * Top N filmova po prosječnoj ocjeni, uz minimalan broj ocjena.
 * OrientDB SQL ne podržava HAVING direktno, pa se filtriranje agregata radi
 * kroz vanjski SELECT nad rezultatom podupita: SELECT FROM (...) WHERE ...
 * (standardni OrientDB idiom za HAVING).
 *
 * Izvodi se u dva koraka, isto kao RavenDB verzija, radi fer poređenja:
 *   1) agregacija nad klasom Rating
 *   2) batch dohvat naslova iz klase Movie za dobijene movieId vrijednosti
 *
 * @param {number} limit
 * @param {number} minRatings
 * @returns {Promise<Array<{movieId:number, title:string, genres:*, avgRating:number, ratingCount:number}>>}
 */
async function orientGetTopRatedMovies(limit = 10, minRatings = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const safeMinRatings = Math.max(0, Number(minRatings) || 50);

  const session = await orientDbService.getOrientSession();
  try {
    const stats = await session
      .query(
        `SELECT FROM (
           SELECT movieId, avg(rating) AS avgRating, count(*) AS ratingCount
           FROM Rating
           GROUP BY movieId
         )
         WHERE ratingCount >= :minRatings
         ORDER BY avgRating DESC
         LIMIT ${safeLimit}`,
        { params: { minRatings: safeMinRatings } }
      )
      .all();

    if (!stats.length) {
      return [];
    }

    const movieIds = stats.map((s) => s.movieId);
    const movies = await session
      .query("SELECT movieId, title, genres FROM Movie WHERE movieId IN :movieIds", {
        params: { movieIds },
      })
      .all();

    const movieMap = new Map(movies.map((m) => [m.movieId, m]));

    return stats.map((s) => {
      const movie = movieMap.get(s.movieId);
      return {
        movieId: s.movieId,
        title: movie ? movie.title : null,
        genres: movie ? movie.genres : null,
        avgRating: Number(Number(s.avgRating).toFixed(2)),
        ratingCount: s.ratingCount,
      };
    });
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// JEDNOSTAVAN POST UPIT - dodaj novi film
// ==========================================

/**
 * Dodaje novi film u Movie klasu - direktan INSERT.
 *
 * Prije upisa provjerava da film sa istim movieId već ne postoji, kako bi se
 * spriječili duplikati (ažuriranje postojećeg filma je posebna PUT/PATCH
 * operacija, ne radi se ovdje).
 * Povratna vrijednost je status-objekat:
 *   - { status: "duplicate" }               -> film sa tim movieId već postoji
 *   - { status: "created", data: {...} }    -> uspješno upisano
 *
 * @param {{movieId:number, title:string, genres:*}} movie
 * @returns {Promise<{status:string, data?:object}>}
 */
async function orientAddMovie(movie) {
  const { movieId, title, genres } = movie;
  const session = await orientDbService.getOrientSession();
  try {
    const existingMovie = await session
      .query("SELECT FROM Movie WHERE movieId = :movieId LIMIT 1", {
        params: { movieId: Number(movieId) },
      })
      .all();
    if (existingMovie.length) {
      return { status: "duplicate" };
    }

    const result = await session
      .command(
        "INSERT INTO Movie SET movieId = :movieId, title = :title, genres = :genres",
        { params: { movieId: Number(movieId), title, genres } }
      )
      .all();

    return { status: "created", data: result[0] || { movieId: Number(movieId), title, genres } };
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// SLOŽEN POST UPIT - dodaj ocjenu SAMO ako korisnik i film već postoje
// ==========================================

/**
 * Dodaje novu ocjenu (Rating) u Rating klasu, ali samo ukoliko SVI
 * preduslovi budu ispunjeni:
 *   1) film sa datim movieId već postoji u Movie klasi
 *   2) korisnik sa datim userId već postoji u User klasi
 *   3) korisnik još UVIJEK NIJE ocijenio taj film (par userId+movieId
 *      mora biti jedinstven - sprječava duplikate)
 *
 * Povratna vrijednost je status-objekat kako bi kontroler mogao razlikovati
 * "ne postoji" (404) od "već postoji ocjena" (409):
 *   - { status: "not_found" }              -> film ili korisnik ne postoje
 *   - { status: "duplicate" }               -> ocjena za taj par već postoji
 *   - { status: "created", data: {...} }    -> uspješno upisano
 *
 * @param {{userId:number, movieId:number, rating:number}} data
 * @returns {Promise<{status:string, data?:object}>}
 */
async function orientAddRating(data) {
  const userId = Number(data.userId);
  const movieId = Number(data.movieId);
  const rating = Number(data.rating);

  const session = await orientDbService.getOrientSession();
  try {
    const movieExists = await session
      .query("SELECT FROM Movie WHERE movieId = :movieId LIMIT 1", {
        params: { movieId },
      })
      .all();
    if (!movieExists.length) {
      return { status: "not_found" };
    }

    const userExists = await session
      .query("SELECT FROM User WHERE userId = :userId LIMIT 1", {
        params: { userId },
      })
      .all();
    if (!userExists.length) {
      return { status: "not_found" };
    }

    const ratingExists = await session
      .query("SELECT FROM Rating WHERE movieId = :movieId AND userId = :userId LIMIT 1", {
        params: { movieId, userId },
      })
      .all();
    if (ratingExists.length) {
      return { status: "duplicate" };
    }

    // Unix timestamp (sekunde) - Rating.timestamp u OrientDB šemi je
    // numerički tip, pa ISO string izaziva "For input string" grešku.
    const timestamp = Math.floor(Date.now() / 1000);
    const result = await session
      .command(
        "INSERT INTO Rating SET userId = :userId, movieId = :movieId, rating = :rating, timestamp = :timestamp",
        { params: { userId, movieId, rating, timestamp } }
      )
      .all();

    return { status: "created", data: result[0] || { userId, movieId, rating, timestamp } };
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// JEDNOSTAVAN PUT UPIT - izmijeni naslov filma po movieId
// ==========================================

/**
 * Izmjenjuje naslov postojećeg filma - provjerava da film sa datim movieId
 * postoji, a zatim izvršava SET-based UPDATE nad tim jednim zapisom
 * (indeksirano polje movieId, isti idiom kao orientGetMovieById).
 *
 * @param {number} movieId
 * @param {string} title
 * @returns {Promise<{status:string, data?:object}>}
 */
async function orientUpdateMovieTitle(movieId, title) {
  const session = await orientDbService.getOrientSession();
  try {
    const existing = await session
      .query("SELECT FROM Movie WHERE movieId = :movieId LIMIT 1", {
        params: { movieId: Number(movieId) },
      })
      .all();
    if (!existing.length) {
      return { status: "not_found" };
    }

    await session
      .command("UPDATE Movie SET title = :title WHERE movieId = :movieId", {
        params: { title, movieId: Number(movieId) },
      })
      .all();

    return {
      status: "updated",
      data: { movieId: Number(movieId), title, genres: existing[0].genres },
    };
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// SLOŽEN PUT UPIT - korekcija ocjena za "aktivne" korisnike (>N ocjena)
// ==========================================

/**
 * Izvodi bulk korekciju ocjena za "aktivne" korisnike (korisnici koji su dali
 * STROGO VIŠE od minRatingsThreshold ocjena). Izvodi se u dva koraka:
 *   1) HAVING-like agregacija kroz vanjski SELECT nad podupitom (isti idiom
 *      kao u orientGetTopRatedMovies), samo ovdje GROUP BY userId umjesto
 *      movieId, da bi se pronašli "aktivni" korisnici.
 *   2) JEDAN SET-based UPDATE nad Rating klasom (rating = rating + :delta), ali
 *      SAMO za zapise čija je TRENUTNA ocjena < 3 (poslovno pravilo iz zahtjeva
 *      - dižu se samo "niske" ocjene, ne diraju se sve ocjene aktivnog korisnika)
 *      za sve zapise čiji userId pripada listi aktivnih korisnika - bez
 *      učitavanja pojedinačnih zapisa u memoriju (za razliku od RavenDB
 *      grane, koja koristi Unit-of-Work/tracked-entity pristup preko
 *      sesije). Ograničenje (clamp) na opseg [0.5, 5.0] se zatim izvodi
 *      kroz dva dodatna, ciljana UPDATE upita (samo nad zapisima koji su
 *      nakon korekcije ispali van dozvoljenog opsega).
 *
 * @param {number} delta - vrijednost koja se dodaje svakoj ocjeni (može biti negativna)
 * @param {number} [minRatingsThreshold=100] - prag za "aktivnog" korisnika (STROGO >)
 * @param {number|null} [maxActiveUsers=null] - DEV/testing safeguard: ograničava BROJ
 *   aktivnih korisnika čije se ocjene zapravo koriguju (ne utiče na GROUP BY sken, koji
 *   mora proći kroz cijelu Rating klasu bez obzira - to je i poanta poređenja bez indeksa).
 *   Bez ovoga, UPDATE ... WHERE userId IN (:activeUserIds) radi linear scan cijele Rating
 *   klase i za SVAKI zapis provjerava pripadnost (potencijalno) hiljadama userId vrijednosti
 *   - O(brojZapisa * brojAktivnihKorisnika), što na OrientDB-u bez indeksa realno može
 *   opteretiti mašinu. null/0 = bez ograničenja (kompletan, "pravi" benchmark).
 * @returns {Promise<{status:string, activeUsersCount:number, updatedCount:number}>}
 */
async function orientCorrectActiveUsersRatings(delta, minRatingsThreshold = 100, maxActiveUsers = null) {
  const session = await orientDbService.getOrientSession();
  try {
    // LIMIT se namjerno ubacuje kao inline broj (isti idiom kao u
    // orientGetTopRatedMovies) - OrientDB SQL ne dozvoljava bind parametar
    // unutar LIMIT klauzule. ORDER BY userId je ovdje da bi ograničen skup
    // aktivnih korisnika bio DETERMINISTIČAN (isti korisnici pri ponovljenim
    // pozivima), inače bi GROUP BY bez indeksa mogao vratiti proizvoljan
    // redoslijed i test ne bi bio ponovljiv.
    const safeMaxActiveUsers =
      maxActiveUsers !== null && maxActiveUsers !== undefined
        ? Math.max(1, Math.floor(Number(maxActiveUsers)))
        : null;
    const limitClause = safeMaxActiveUsers ? `ORDER BY userId LIMIT ${safeMaxActiveUsers}` : "";

    const activeUsers = await session
      .query(
        `SELECT FROM (
           SELECT userId, count(*) AS ratingCount
           FROM Rating
           GROUP BY userId
         )
         WHERE ratingCount > :minRatingsThreshold
         ${limitClause}`,
        { params: { minRatingsThreshold } }
      )
      .all();

    if (!activeUsers.length) {
      return { status: "no_active_users", activeUsersCount: 0, updatedCount: 0 };
    }

    const activeUserIds = activeUsers.map((u) => u.userId);

    const updateResult = await session
      .command(
        "UPDATE Rating SET rating = rating + :delta WHERE userId IN :activeUserIds AND rating < 3",
        {
          params: { delta, activeUserIds },
        }
      )
      .all();

    // Clamp - dvije ciljane korekcije samo nad zapisima koji su nakon
    // "+ delta" ispali van validnog MovieLens opsega (0.5 - 5.0).
    await session
      .command("UPDATE Rating SET rating = 5.0 WHERE userId IN :activeUserIds AND rating > 5", {
        params: { activeUserIds },
      })
      .all();
    await session
      .command(
        "UPDATE Rating SET rating = 0.5 WHERE userId IN :activeUserIds AND rating < 0.5",
        { params: { activeUserIds } }
      )
      .all();

    // OrientDB UPDATE komanda po defaultu koristi RETURN COUNT (broj
    // izmijenjenih zapisa) - rezultat je jedan "wrapped" zapis čije se
    // polje razlikuje po verziji servera ("count" ili "result"), otuda
    // dvostruki fallback ispod.
    const updatedCount =
      (updateResult[0] && (updateResult[0].count ?? updateResult[0].result)) ??
      updateResult.length;

    return {
      status: "corrected",
      activeUsersCount: activeUserIds.length,
      updatedCount,
    };
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// JEDNOSTAVAN DELETE UPIT - obriši jedan tag zapis
// ==========================================

/**
 * Briše TAČNO JEDAN tag zapis iz Tag klase - direktan WHERE-lookup (bez
 * agregacije/pod-upita) po trojki (userId, movieId, tag), koja jednoznačno
 * identifikuje jedan zapis (vidi napomenu o Tags šemi na vrhu fajla).
 * "LIMIT 1" u DELETE komandi je dodatna zaštita da se obriše najviše jedan
 * zapis čak i u (teorijski mogućem) slučaju duplikata iste trojke.
 *
 * Povratna vrijednost je status-objekat:
 *   - { status: "not_found" }             -> tag zapis sa datom trojkom ne postoji
 *   - { status: "deleted", data: {...} }  -> uspješno obrisano
 *
 * @param {{userId:number, movieId:number, tag:string}} data
 * @returns {Promise<{status:string, data?:object}>}
 */
async function orientDeleteTag(data) {
  const userId = Number(data.userId);
  const movieId = Number(data.movieId);
  const { tag } = data;

  const session = await orientDbService.getOrientSession();
  try {
    const existing = await session
      .query(
        "SELECT FROM Tag WHERE userId = :userId AND movieId = :movieId AND tag = :tag LIMIT 1",
        { params: { userId, movieId, tag } }
      )
      .all();

    if (!existing.length) {
      return { status: "not_found" };
    }

    await session
      .command(
        "DELETE FROM Tag WHERE userId = :userId AND movieId = :movieId AND tag = :tag LIMIT 1",
        { params: { userId, movieId, tag } }
      )
      .all();

    return { status: "deleted", data: existing[0] };
  } finally {
    await session.close().catch(() => {});
  }
}

// ==========================================
// SLOŽEN DELETE UPIT - "orphan cleanup": obriši ocjene filmova bez ijednog taga
// ==========================================

/**
 * Briše ocjene (Rating) filmova koji NEMAJU nijedan tag u Tag klasi.
 * Izvodi se u dva koraka:
 *   1) "SELECT DISTINCT movieId FROM Tag" - skup SVIH movieId vrijednosti
 *      koje IMAJU bar jedan tag.
 *   2) JEDAN SET-based DELETE nad Rating klasom (isti idiom kao u
 *      orientCorrectActiveUsersRatings - bez učitavanja pojedinačnih
 *      zapisa u memoriju) za zapise čiji movieId NIJE u tom skupu,
 *      ograničeno LIMIT klauzulom na "limit" zapisa po pozivu.
 *
 * NAMJERNO OGRANIČENO na "limit" (podrazumijevano i maksimalno 10, vidi
 * movie.controller.js) obrisanih ocjena PO POZIVU, a ne odjednom svih -
 * filmova bez ijednog taga u MovieLens dataset-u ima jako mnogo, pa bi
 * neograničeno brisanje u jednom pozivu obrisalo ogromnu većinu Rating
 * podataka odjednom. Endpoint je zamišljen da se po potrebi poziva više
 * puta (npr. iz skripte), dok se ne vrati deletedCount = 0.
 *
 * @param {number} limit - maksimalan broj ocjena za brisanje u ovom pozivu
 * @returns {Promise<{status:string, deletedCount:number}>}
 */
async function orientDeleteOrphanMovieRatings(limit = 10) {
  const session = await orientDbService.getOrientSession();
  try {
    const taggedStats = await session.query("SELECT DISTINCT movieId FROM Tag").all();
    const taggedMovieIds = taggedStats.map((s) => s.movieId);

    // Ako baš NIJEDAN film u cijeloj bazi nema tag, "NOT IN" filter se
    // preskače - u tom slučaju je SVAKI film "orphan", pa se prosto briše
    // prvih "limit" zapisa iz cijele Rating klase.
    const deleteResult = taggedMovieIds.length
      ? await session
          .command(`DELETE FROM Rating WHERE movieId NOT IN :taggedMovieIds LIMIT ${limit}`, {
            params: { taggedMovieIds },
          })
          .all()
      : await session.command(`DELETE FROM Rating LIMIT ${limit}`).all();

    // Isti "RETURN COUNT" dvostruki fallback kao u
    // orientCorrectActiveUsersRatings (polje se razlikuje po verziji servera).
    const deletedCount =
      (deleteResult[0] && (deleteResult[0].count ?? deleteResult[0].result)) ?? 0;

    return {
      status: deletedCount > 0 ? "deleted" : "no_orphans",
      deletedCount,
    };
  } finally {
    await session.close().catch(() => {});
  }
}

module.exports = {
  ravendb: {
    getMovieById: ravenGetMovieById,
    getTopRatedMovies: ravenGetTopRatedMovies,
    addMovie: ravenAddMovie,
    addRating: ravenAddRating,
    updateMovieTitle: ravenUpdateMovieTitle,
    correctActiveUsersRatings: ravenCorrectActiveUsersRatings,
    deleteTag: ravenDeleteTag,
    deleteOrphanMovieRatings: ravenDeleteOrphanMovieRatings,
  },
  orientdb: {
    getMovieById: orientGetMovieById,
    getTopRatedMovies: orientGetTopRatedMovies,
    addMovie: orientAddMovie,
    addRating: orientAddRating,
    updateMovieTitle: orientUpdateMovieTitle,
    correctActiveUsersRatings: orientCorrectActiveUsersRatings,
    deleteTag: orientDeleteTag,
    deleteOrphanMovieRatings: orientDeleteOrphanMovieRatings,
  },
};