const movieService = require("../services/movie.service");

/**
 * Kontroler zadužen za upite nad MovieLens filmovima.
 * Umjesto odvojenih funkcija po bazi, ovdje se baza bira dinamički preko
 * route parametra ":dbEngine" (ravendb | orientdb), čime se izbjeglo
 * dupliciranje - movieService već ima strukturu { ravendb: {...}, orientdb: {...} }
 * (vidi movie.service.js), pa se do prave implementacije dolazi jednostavno
 * preko movieService[dbEngine].
 *
 * Svaki odgovor sadrži "tookMs" - vrijeme izvršavanja upita na serveru
 * (bez mrežne latencije ka klijentu), korisno za benchmark analizu.
 */

const SUPPORTED_ENGINES = ["ravendb", "orientdb"];

/**
 * Mjeri trajanje, CPU i RAM SAMO oko poziva servisnom sloju (tj. SAMO oko
 * stvarnog poziva bazi - ravendb.service.js / orientdb.service.js), bez
 * Express routing/validacije oko njega. Ovo je uža, precizna metrika u
 * odnosu na middleware/requestMetrics.middleware.js, koja mjeri CIJELI HTTP
 * request (uključujući ovaj poziv, ali i sve oko njega).
 *
 * Koristi se identično za SVAKI od 8 osnovnih CRUD endpointa (4 operacije ×
 * 2 baze: getMovieById, addMovie, updateMovieTitle, deleteTag - kao i za
 * "složene" upite/operacije), tako da su rezultati direktno uporedivi
 * RavenDB vs OrientDB (isti mehanizam mjerenja, mijenja se samo servis koji
 * se poziva).
 *
 * - tookMs        -> trajanje poziva (process.hrtime, visoka preciznost)
 * - cpuUserMs      -> CPU vrijeme u user modu POTROŠENO tokom poziva (delta)
 * - cpuSystemMs    -> CPU vrijeme u kernel/system modu POTROŠENO tokom poziva (delta)
 * - rssDeltaBytes  -> promjena rezidentne memorije Node procesa tokom poziva
 * - heapUsedDeltaBytes -> promjena zauzetog V8 heap-a tokom poziva
 *
 * NAPOMENA o RAM delti: Node-ov garbage collector radi asinhrono/povremeno,
 * pa negativna heap/rss delta (memorija se "smanjila") NIJE greška - GC je
 * mogao pokupiti smeće baš tokom mjerenog poziva. Za stabilnije RAM brojeve
 * gledati prosjek preko više ponovljenih poziva, ne pojedinačni zapis.
 */
async function measure(fn) {
  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const start = process.hrtime.bigint();

  const result = await fn();

  const tookMs = Number(process.hrtime.bigint() - start) / 1e6;
  const cpuDelta = process.cpuUsage(cpuBefore); // { user, system } u mikrosekundama, DELTA
  const memAfter = process.memoryUsage();

  return {
    result,
    tookMs: Number(tookMs.toFixed(3)),
    cpuUserMs: Number((cpuDelta.user / 1000).toFixed(3)),
    cpuSystemMs: Number((cpuDelta.system / 1000).toFixed(3)),
    rssDeltaBytes: memAfter.rss - memBefore.rss,
    heapUsedDeltaBytes: memAfter.heapUsed - memBefore.heapUsed,
  };
}

/**
 * Izvlači "benchmark" polja iz rezultata measure() u zaseban objekat, radi
 * dosljednog uključivanja u SVAKI JSON odgovor kontrolera (vidi upotrebu
 * niže u svakoj handler funkciji).
 */
function toBenchmarkFields({ tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes }) {
  return { tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes };
}

/**
 * Validira i vraća servisni modul za traženi dbEngine, ili null ako
 * vrijednost nije dozvoljena. Eksplicitna bijela lista (umjesto direktnog
 * movieService[req.params.dbEngine]) sprječava pristup nepredviđenim
 * svojstvima objekta (npr. "constructor") preko URL parametra.
 */
function resolveEngine(dbEngine) {
  if (!SUPPORTED_ENGINES.includes(dbEngine)) {
    return null;
  }
  return movieService[dbEngine];
}

// ==========================================
// JEDNOSTAVAN GET UPIT - pronađi film po ID-u
// ==========================================

/**
 * GET /api/movies/:dbEngine/:id
 * :dbEngine -> "ravendb" ili "orientdb"
 */
async function getMovieById(req, res, next) {
  try {
    const { dbEngine, id } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const movieId = Number(id);
    if (!Number.isInteger(movieId)) {
      return res
        .status(400)
        .json({ success: false, message: "Parametar 'id' mora biti cijeli broj." });
    }

    const measured = await measure(() => service.getMovieById(movieId));
    const movie = measured.result;

    if (!movie) {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Film sa ID ${movieId} nije pronađen.`,
      });
    }

    return res
      .status(200)
      .json({ success: true, engine: dbEngine, ...toBenchmarkFields(measured), data: movie });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// SLOŽEN GET UPIT - Top N filmova po prosječnoj ocjeni (min. minRatings ocjena)
// ==========================================

/**
 * GET /api/movies/:dbEngine/top-rated?limit=10&minRatings=50
 * :dbEngine -> "ravendb" ili "orientdb"
 */
async function getTopRatedMovies(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const minRatings = req.query.minRatings ? Number(req.query.minRatings) : 50;

    const measured = await measure(() => service.getTopRatedMovies(limit, minRatings));
    const movies = measured.result;

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      ...toBenchmarkFields(measured),
      count: movies.length,
      data: movies,
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// JEDNOSTAVAN POST UPIT - dodaj novi film
// ==========================================

/**
 * POST /api/movies/:dbEngine
 * :dbEngine -> "ravendb" ili "orientdb"
 * body: { movieId: number, title: string, genres: string }
 *
 * Ako film sa istim movieId već postoji, vraća se 409 (bez upisa) - izmjena
 * postojećeg filma je posebna PUT/PATCH operacija koja se radi naknadno.
 */
async function addMovie(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const { movieId, title, genres } = req.body;
    const parsedMovieId = Number(movieId);

    if (!Number.isInteger(parsedMovieId)) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'movieId' mora biti cijeli broj." });
    }
    if (!title || typeof title !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'title' je obavezno i mora biti string." });
    }

    const measured = await measure(() =>
      service.addMovie({ movieId: parsedMovieId, title, genres })
    );
    const result = measured.result;

    if (result.status === "duplicate") {
      return res.status(409).json({
        success: false,
        engine: dbEngine,
        message: `Film sa movieId=${parsedMovieId} već postoji - koristite izmjenu (update) umjesto ponovnog dodavanja.`,
      });
    }

    return res
      .status(201)
      .json({ success: true, engine: dbEngine, ...toBenchmarkFields(measured), data: result.data });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// JEDNOSTAVAN PUT UPIT - izmijeni naslov filma po movieId
// ==========================================

/**
 * PUT /api/movies/:dbEngine/:id
 * :dbEngine -> "ravendb" ili "orientdb"
 * body: { title: string }
 *
 * Izmjenjuje SAMO naslov postojećeg filma (movieId služi isključivo za
 * pronalaženje filma i ne mijenja se). Ako film sa datim movieId ne
 * postoji, vraća se 404 (dodavanje novog filma je posebna POST operacija).
 */
async function updateMovieTitle(req, res, next) {
  try {
    const { dbEngine, id } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const movieId = Number(id);
    if (!Number.isInteger(movieId)) {
      return res
        .status(400)
        .json({ success: false, message: "Parametar 'id' mora biti cijeli broj." });
    }

    const { title } = req.body;
    if (!title || typeof title !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'title' je obavezno i mora biti string." });
    }

    const measured = await measure(() => service.updateMovieTitle(movieId, title));
    const result = measured.result;

    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Film sa ID ${movieId} nije pronađen - izmjena nije moguća.`,
      });
    }

    return res
      .status(200)
      .json({ success: true, engine: dbEngine, ...toBenchmarkFields(measured), data: result.data });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// SLOŽEN POST UPIT - dodaj ocjenu SAMO ako korisnik i film već postoje
// ==========================================

/**
 * POST /api/movies/:dbEngine/ratings
 * :dbEngine -> "ravendb" ili "orientdb"
 * body: { userId: number, movieId: number, rating: number }
 *
 * Ocjena se upisuje SAMO ako i korisnik (userId) i film (movieId) već
 * postoje (u suprotnom 404) i ako korisnik još nije ocijenio taj film
 * (u suprotnom 409 - spriječava duplikate) - vidi movie.service.js za
 * detalje provjere.
 */
async function addRating(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const { userId, movieId, rating } = req.body;
    const parsedUserId = Number(userId);
    const parsedMovieId = Number(movieId);
    const parsedRating = Number(rating);

    if (!Number.isInteger(parsedUserId)) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'userId' mora biti cijeli broj." });
    }
    if (!Number.isInteger(parsedMovieId)) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'movieId' mora biti cijeli broj." });
    }
    if (!Number.isFinite(parsedRating) || parsedRating < 0.5 || parsedRating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'rating' mora biti broj u opsegu 0.5 - 5." });
    }

    const measured = await measure(() =>
      service.addRating({ userId: parsedUserId, movieId: parsedMovieId, rating: parsedRating })
    );
    const result = measured.result;

    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Ocjena nije dodana - korisnik (userId=${parsedUserId}) i/ili film (movieId=${parsedMovieId}) ne postoje.`,
      });
    }

    if (result.status === "duplicate") {
      return res.status(409).json({
        success: false,
        engine: dbEngine,
        message: `Korisnik (userId=${parsedUserId}) je već ocijenio film (movieId=${parsedMovieId}) - ocjena se ne može duplirati.`,
      });
    }

    return res
      .status(201)
      .json({ success: true, engine: dbEngine, ...toBenchmarkFields(measured), data: result.data });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// SLOŽEN PUT UPIT - korekcija ocjena za "aktivne" korisnike (>N ocjena)
// ==========================================

/**
 * PUT /api/movies/:dbEngine/ratings/correction
 * :dbEngine -> "ravendb" ili "orientdb"
 * body: {
 *   delta: number,        // vrijednost koja se dodaje svakoj ocjeni (može biti i negativna, npr. -0.5)
 *   minRatings?: number   // prag za "aktivnog" korisnika - STROGO VIŠE od ove vrijednosti; default 100
 * }
 *
 * "Aktivan" korisnik = korisnik koji je dao VIŠE OD minRatings ocjena (default 100,
 * kako je i traženo). Korekcija (delta) se dodaje SVAKOJ ocjeni tih korisnika, a
 * rezultat se ograničava (clamp) na validan MovieLens opseg 0.5 - 5.0 (vidi
 * movie.service.js za implementaciju po engine-u).
 */
async function correctActiveUsersRatings(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const { delta, minRatings, maxActiveUsers } = req.body;
    const parsedDelta = Number(delta);
    const parsedMinRatings = minRatings !== undefined ? Number(minRatings) : 100;
    const parsedMaxActiveUsers = maxActiveUsers !== undefined ? Number(maxActiveUsers) : null;

    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
      return res.status(400).json({
        success: false,
        message: "Polje 'delta' je obavezno, mora biti broj različit od 0 (npr. 0.5 ili -0.5).",
      });
    }
    if (!Number.isInteger(parsedMinRatings) || parsedMinRatings < 0) {
      return res.status(400).json({
        success: false,
        message: "Polje 'minRatings' mora biti nenegativan cijeli broj (podrazumijevano 100).",
      });
    }
    // Opciono, SAMO za dev/testing - ograničava broj aktivnih korisnika čije se
    // ocjene stvarno koriguju (vidi JSDoc u movie.service.js). Za "pravi",
    // kompletan benchmark (npr. onaj koji se poredi sa/bez indeksa) izostaviti
    // ovo polje - tada nema ograničenja, kao i do sad.
    if (
      maxActiveUsers !== undefined &&
      (!Number.isInteger(parsedMaxActiveUsers) || parsedMaxActiveUsers < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Polje 'maxActiveUsers' (opciono) mora biti pozitivan cijeli broj.",
      });
    }

    const measured = await measure(() =>
      service.correctActiveUsersRatings(parsedDelta, parsedMinRatings, parsedMaxActiveUsers)
    );
    const result = measured.result;

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      ...toBenchmarkFields(measured),
      message:
        result.status === "no_active_users"
          ? `Nema aktivnih korisnika sa više od ${parsedMinRatings} ocjena - ništa nije izmijenjeno.`
          : `Korekcija (${parsedDelta > 0 ? "+" : ""}${parsedDelta}) primijenjena na ocjene aktivnih korisnika${
              parsedMaxActiveUsers ? ` (ograničeno na ${parsedMaxActiveUsers} korisnika - dev test)` : ""
            }.`,
      data: {
        activeUsersCount: result.activeUsersCount,
        updatedRatingsCount: result.updatedCount,
        maxActiveUsers: parsedMaxActiveUsers,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// JEDNOSTAVAN DELETE UPIT - obriši jedan tag zapis
// ==========================================

/**
 * DELETE /api/movies/:dbEngine/tags
 * :dbEngine -> "ravendb" ili "orientdb"
 * body: { userId: number, movieId: number, tag: string }
 *
 * Briše TAČNO JEDAN tag zapis koji odgovara datoj trojki
 * (userId, movieId, tag) - to je prirodni složeni ključ jednog tag zapisa
 * u MovieLens šemi (isti korisnik može dati VIŠE različitih tagova istom
 * filmu, pa sam userId+movieId nije dovoljan da jednoznačno identifikuje
 * jedan zapis - vidi movie.service.js za detalje).
 */
async function deleteTag(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const { userId, movieId, tag } = req.body;
    const parsedUserId = Number(userId);
    const parsedMovieId = Number(movieId);

    if (!Number.isInteger(parsedUserId)) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'userId' mora biti cijeli broj." });
    }
    if (!Number.isInteger(parsedMovieId)) {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'movieId' mora biti cijeli broj." });
    }
    if (!tag || typeof tag !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Polje 'tag' je obavezno i mora biti string." });
    }

    const measured = await measure(() =>
      service.deleteTag({ userId: parsedUserId, movieId: parsedMovieId, tag })
    );
    const result = measured.result;

    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Tag zapis (userId=${parsedUserId}, movieId=${parsedMovieId}, tag="${tag}") nije pronađen.`,
      });
    }

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      ...toBenchmarkFields(measured),
      message: "Tag zapis uspješno obrisan.",
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// SLOŽEN DELETE UPIT - "orphan cleanup": obriši ocjene filmova bez ijednog taga
// ==========================================

/**
 * DELETE /api/movies/:dbEngine/ratings/orphan-cleanup?limit=10
 * :dbEngine -> "ravendb" ili "orientdb"
 *
 * "Orphan cleanup": briše ocjene (Ratings) filmova koji NEMAJU nijedan tag.
 * NAMJERNO ograničeno na najviše 10 obrisanih ocjena PO POZIVU (podrazumijevana
 * i ujedno GORNJA granica za query parametar 'limit') - filmova bez ijednog
 * taga ima mnogo, pa bi neograničeno brisanje u jednom pozivu obrisalo veliku
 * većinu Ratings podataka odjednom i ostalo bi jako malo podataka za dalji
 * benchmark. Endpoint je zamišljen da se po potrebi poziva više puta (npr.
 * iz skripte), dok se ne vrati deletedCount = 0.
 */
async function deleteOrphanMovieRatings(req, res, next) {
  try {
    const { dbEngine } = req.params;

    const service = resolveEngine(dbEngine);
    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const requestedLimit = req.query.limit !== undefined ? Number(req.query.limit) : 10;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({
        success: false,
        message: "Query parametar 'limit' mora biti pozitivan cijeli broj.",
      });
    }
    // Tvrda gornja granica od 10 po pozivu (vidi JSDoc gore) - čak i ako se
    // pošalje veći 'limit', ne dozvoljava se prekoračenje.
    const safeLimit = Math.min(requestedLimit, 10);

    const measured = await measure(() => service.deleteOrphanMovieRatings(safeLimit));
    const result = measured.result;

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      ...toBenchmarkFields(measured),
      message:
        result.status === "no_orphans"
          ? "Nema više ocjena za filmove bez ijednog taga - nema šta da se obriše."
          : `Obrisano ${result.deletedCount} ocjena (limit po pozivu: ${safeLimit}) za filmove bez ijednog taga.`,
      data: { deletedCount: result.deletedCount, limit: safeLimit },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMovieById,
  getTopRatedMovies,
  addMovie,
  addRating,
  updateMovieTitle,
  correctActiveUsersRatings,
  deleteTag,
  deleteOrphanMovieRatings,
};