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
 *   RavenDB kolekcija "Users"   -> { userId }
 *
 *   OrientDB klasa "Movie"  -> { movieId, title, genres }
 *   OrientDB klasa "Rating" -> { movieId, userId, rating, timestamp }
 *   OrientDB klasa "User"   -> { userId }
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
 *   2) Svi Ratings dokumenti tih korisnika (whereIn "userId") se učitavaju
 *      kao "tracked" entiteti u istoj sesiji; korekcija (+ delta) i clamp
 *      na opseg [0.5, 5.0] se rade u JS-u, a SVE promjene se šalju na
 *      server u JEDNOM saveChanges() pozivu (RavenDB Unit-of-Work batching
 *      - jedan HTTP zahtjev bez obzira na broj izmijenjenih dokumenata).
 *
 * @param {number} delta - vrijednost koja se dodaje svakoj ocjeni (može biti negativna)
 * @param {number} [minRatingsThreshold=100] - prag za "aktivnog" korisnika (STROGO >)
 * @returns {Promise<{status:string, activeUsersCount:number, updatedCount:number}>}
 */
async function ravenCorrectActiveUsersRatings(delta, minRatingsThreshold = 100) {
  const session = ravenDbService.openSession();
  try {
    const activeUsers = await session.advanced
      .rawQuery(
        `from Ratings
         group by userId
         where count() > $minRatingsThreshold
         select userId, count() as ratingCount`
      )
      .addParameter("minRatingsThreshold", minRatingsThreshold)
      .all();

    if (!activeUsers.length) {
      return { status: "no_active_users", activeUsersCount: 0, updatedCount: 0 };
    }

    const activeUserIds = activeUsers.map((u) => u.userId);

    const ratings = await session
      .query({ collection: "Ratings" })
      .whereIn("userId", activeUserIds)
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
 *   2) JEDAN SET-based UPDATE nad Rating klasom (rating = rating + :delta)
 *      za sve zapise čiji userId pripada listi aktivnih korisnika - bez
 *      učitavanja pojedinačnih zapisa u memoriju (za razliku od RavenDB
 *      grane, koja koristi Unit-of-Work/tracked-entity pristup preko
 *      sesije). Ograničenje (clamp) na opseg [0.5, 5.0] se zatim izvodi
 *      kroz dva dodatna, ciljana UPDATE upita (samo nad zapisima koji su
 *      nakon korekcije ispali van dozvoljenog opsega).
 *
 * @param {number} delta - vrijednost koja se dodaje svakoj ocjeni (može biti negativna)
 * @param {number} [minRatingsThreshold=100] - prag za "aktivnog" korisnika (STROGO >)
 * @returns {Promise<{status:string, activeUsersCount:number, updatedCount:number}>}
 */
async function orientCorrectActiveUsersRatings(delta, minRatingsThreshold = 100) {
  const session = await orientDbService.getOrientSession();
  try {
    const activeUsers = await session
      .query(
        `SELECT FROM (
           SELECT userId, count(*) AS ratingCount
           FROM Rating
           GROUP BY userId
         )
         WHERE ratingCount > :minRatingsThreshold`,
        { params: { minRatingsThreshold } }
      )
      .all();

    if (!activeUsers.length) {
      return { status: "no_active_users", activeUsersCount: 0, updatedCount: 0 };
    }

    const activeUserIds = activeUsers.map((u) => u.userId);

    const updateResult = await session
      .command("UPDATE Rating SET rating = rating + :delta WHERE userId IN :activeUserIds", {
        params: { delta, activeUserIds },
      })
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

module.exports = {
  ravendb: {
    getMovieById: ravenGetMovieById,
    getTopRatedMovies: ravenGetTopRatedMovies,
    addMovie: ravenAddMovie,
    addRating: ravenAddRating,
    updateMovieTitle: ravenUpdateMovieTitle,
    correctActiveUsersRatings: ravenCorrectActiveUsersRatings,
  },
  orientdb: {
    getMovieById: orientGetMovieById,
    getTopRatedMovies: orientGetTopRatedMovies,
    addMovie: orientAddMovie,
    addRating: orientAddRating,
    updateMovieTitle: orientUpdateMovieTitle,
    correctActiveUsersRatings: orientCorrectActiveUsersRatings,
  },
};