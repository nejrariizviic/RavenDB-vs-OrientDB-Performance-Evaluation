const express = require("express");
const metricsStore = require("../utils/metricsStore");

const router = express.Router();

/**
 * GET /api/metrics/requests?limit=100
 * Vraća posljednjih `limit` (default: svi, max 2000) zapisa per-request
 * metrika prikupljenih preko requestMetrics.middleware.js - trajanje,
 * CPU, RAM, broj konkurentnih zahtjeva u trenutku svakog requesta.
 * Korisno za izvoz podataka nakon benchmark run-a (npr. u CSV/Excel).
 */
router.get("/requests", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = metricsStore.getRequestMetrics(limit);
  res.status(200).json({ success: true, count: data.length, data });
});

/**
 * GET /api/metrics/concurrent
 * Vraća TRENUTNI broj konkurentnih (još neodgovorenih) HTTP zahtjeva.
 * Najkorisnije da se poziva paralelno DOK traje load-test (npr. iz druge
 * skripte/terminala) da se vidi kako concurrency raste/opada u realnom vremenu.
 */
router.get("/concurrent", (req, res) => {
  res.status(200).json({
    success: true,
    concurrentRequests: metricsStore.getConcurrentRequests(),
  });
});

/**
 * DELETE /api/metrics/requests
 * Briše prikupljene request metrike iz memorije (bez restarta servera) -
 * korisno da "resetuješ" mjerenje prije novog benchmark run-a.
 */
router.delete("/requests", (req, res) => {
  metricsStore.clearRequestMetrics();
  res.status(200).json({ success: true, message: "Metrike zahtjeva su obrisane." });
});

module.exports = router;
