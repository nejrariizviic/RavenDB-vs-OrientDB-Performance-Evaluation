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

module.exports = {
  getMovieById,
  getTopRatedMovies,
};