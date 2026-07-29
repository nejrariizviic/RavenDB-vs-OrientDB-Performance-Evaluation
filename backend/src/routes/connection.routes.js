const express = require("express");
const connectionController = require("../controllers/connection.controller");

const router = express.Router();

// GET /api/connection/status - status obje konekcije istovremeno
router.get("/status", connectionController.checkAllConnections);

// GET /api/connection/ravendb - status RavenDB konekcije
router.get("/ravendb", connectionController.checkRavenDbConnection);

// GET /api/connection/orientdb - status OrientDB konekcije
router.get("/orientdb", connectionController.checkOrientDbConnection);

module.exports = router;
