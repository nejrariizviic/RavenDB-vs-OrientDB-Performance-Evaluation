const express = require("express");
const connectionController = require("../controllers/connection.controller");

const router = express.Router();

// GET /api/connection/status - status obje konekcije istovremeno
router.get("/status", connectionController.checkAllConnections);

// GET /api/connection/ravendb - status RavenDB konekcije
router.get("/ravendb", connectionController.checkRavenDbConnection);

// GET /api/connection/orientdb - status OrientDB konekcije
router.get("/orientdb", connectionController.checkOrientDbConnection);

// GET /api/connection/session-cost/:dbEngine?runs=5 - trošak otvaranja/zatvaranja
// JEDNE sesije/konekcije ka bazi, ponovljeno "runs" puta (podrazumijevano 5,
// max 50) radi stabilnijeg prosjeka. Radi za obje baze (ravendb | orientdb).
router.get("/session-cost/:dbEngine", connectionController.testSessionCost);

module.exports = router;
