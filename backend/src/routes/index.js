const express = require("express");
const connectionRoutes = require("./connection.routes");

const router = express.Router();

/**
 * Centralni router aplikacije.
 * Svi budući benchmark endpointi (npr. /movies, /benchmark)
 * treba da se registruju ovdje na isti način kao connectionRoutes,
 * čime se održava jasna organizacija po slojevima:
 * routes -> controllers -> services.
 */
router.use("/connection", connectionRoutes);

module.exports = router;
