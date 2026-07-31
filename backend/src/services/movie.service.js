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
 *
 *   OrientDB klasa "Movie"  -> { movieId, title, genres }
 *   OrientDB klasa "Rating" -> { movieId, userId, rating, timestamp }
 *
 * Ako je u tvom modelu ID RavenDB dokumenta drugačiji (npr. auto-generisan
 * "movies/1-A"), ravenGetMovieById treba zamijeniti sa upitom po polju
 * movieId (whereEquals), umjesto direktnog session.load().
 */

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

module.exports = {
  ravendb: {
    getMovieById: ravenGetMovieById,
    getTopRatedMovies: ravenGetTopRatedMovies,
  },
  orientdb: {
    getMovieById: orientGetMovieById,
    getTopRatedMovies: orientGetTopRatedMovies,
  },
};