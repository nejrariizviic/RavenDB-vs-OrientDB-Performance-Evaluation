const express = require("express");
const connectionRoutes = require("./connection.routes");
const movieRoutes = require("./movie.routes");
const metricsRoutes = require("./metrics.routes");

const router = express.Router();

/**
 * Centralni router aplikacije.
 * Svi budući benchmark endpointi treba da se registruju ovdje na isti način
 * kao connectionRoutes i movieRoutes, čime se održava jasna organizacija
 * po slojevima: routes -> controllers -> services.
 */
router.use("/connection", connectionRoutes);
router.use("/movies", movieRoutes);
router.use("/metrics", metricsRoutes);

module.exports = router;
