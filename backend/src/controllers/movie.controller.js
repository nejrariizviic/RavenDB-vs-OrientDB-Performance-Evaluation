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
 * Mjeri trajanje izvršavanja asinhrone funkcije u milisekundama.
 */
async function measure(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const tookMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { result, tookMs };
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

    const { result: movie, tookMs } = await measure(() => service.getMovieById(movieId));

    if (!movie) {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Film sa ID ${movieId} nije pronađen.`,
      });
    }

    return res.status(200).json({ success: true, engine: dbEngine, tookMs, data: movie });
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

    const { result: movies, tookMs } = await measure(() =>
      service.getTopRatedMovies(limit, minRatings)
    );

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      tookMs,
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

    const { result, tookMs } = await measure(() =>
      service.addMovie({ movieId: parsedMovieId, title, genres })
    );

    if (result.status === "duplicate") {
      return res.status(409).json({
        success: false,
        engine: dbEngine,
        message: `Film sa movieId=${parsedMovieId} već postoji - koristite izmjenu (update) umjesto ponovnog dodavanja.`,
      });
    }

    return res.status(201).json({ success: true, engine: dbEngine, tookMs, data: result.data });
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

    const { result, tookMs } = await measure(() => service.updateMovieTitle(movieId, title));

    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        engine: dbEngine,
        message: `Film sa ID ${movieId} nije pronađen - izmjena nije moguća.`,
      });
    }

    return res.status(200).json({ success: true, engine: dbEngine, tookMs, data: result.data });
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

    const { result, tookMs } = await measure(() =>
      service.addRating({ userId: parsedUserId, movieId: parsedMovieId, rating: parsedRating })
    );

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

    return res.status(201).json({ success: true, engine: dbEngine, tookMs, data: result.data });
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

    const { delta, minRatings } = req.body;
    const parsedDelta = Number(delta);
    const parsedMinRatings = minRatings !== undefined ? Number(minRatings) : 100;

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

    const { result, tookMs } = await measure(() =>
      service.correctActiveUsersRatings(parsedDelta, parsedMinRatings)
    );

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      tookMs,
      message:
        result.status === "no_active_users"
          ? `Nema aktivnih korisnika sa više od ${parsedMinRatings} ocjena - ništa nije izmijenjeno.`
          : `Korekcija (${parsedDelta > 0 ? "+" : ""}${parsedDelta}) primijenjena na ocjene aktivnih korisnika.`,
      data: {
        activeUsersCount: result.activeUsersCount,
        updatedRatingsCount: result.updatedCount,
      },
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
};