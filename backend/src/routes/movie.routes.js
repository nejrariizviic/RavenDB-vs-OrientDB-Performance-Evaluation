const express = require("express");
const movieController = require("../controllers/movie.controller");

const router = express.Router();

/**
 * :dbEngine je "ravendb" ili "orientdb" - ista ruta opslužuje oba engine-a
 * (kontroler validira dozvoljenu vrijednost, vidi movie.controller.js).
 * URL-ovi ostaju identični kao i prije (npr. /api/movies/ravendb/1,
 * /api/movies/orientdb/top-rated), samo je iza njih sad jedna ruta umjesto
 * dvije odvojene po bazi.
 *
 * VAŽNO O REDOSLIJEDU RUTA:
 * "/:dbEngine/top-rated" MORA biti registrovan PRIJE "/:dbEngine/:id",
 * inače bi Express protumačio "top-rated" kao vrijednost parametra :id
 * i nikad ne bi stigao do prave rute.
 */

// GET /api/movies/:dbEngine/top-rated - SLOŽEN upit: Top 10 filmova po prosječnoj ocjeni (min. 50 ocjena)
router.get("/:dbEngine/top-rated", movieController.getTopRatedMovies);

// GET /api/movies/:dbEngine/:id - JEDNOSTAVAN upit: pronađi film po ID-u
router.get("/:dbEngine/:id", movieController.getMovieById);

// POST /api/movies/:dbEngine - JEDNOSTAVAN upit: dodaj novi film
router.post("/:dbEngine", movieController.addMovie);

// POST /api/movies/:dbEngine/ratings - SLOŽEN upit: dodaj ocjenu SAMO ako korisnik i film već postoje
router.post("/:dbEngine/ratings", movieController.addRating);

// PUT /api/movies/:dbEngine/ratings/correction - SLOŽEN upit: korekcija ocjena
// za "aktivne" korisnike (> minRatings ocjena, podrazumijevano 100).
// Registrovano PRIJE "/:dbEngine/:id" iz istog razloga kao i "top-rated" kod
// GET ruta (jasnoća/konvencija - konkretna akcija ide prije generičke rute).
router.put("/:dbEngine/ratings/correction", movieController.correctActiveUsersRatings);

// PUT /api/movies/:dbEngine/:id - JEDNOSTAVAN upit: izmijeni naslov filma po movieId
router.put("/:dbEngine/:id", movieController.updateMovieTitle);

module.exports = router;