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

module.exports = router;