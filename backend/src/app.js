const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const routes = require("./routes");
const requestMetricsMiddleware = require("./middleware/requestMetrics.middleware");

const app = express();

// ==========================================
// GLOBALNI MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
// Mjeri trajanje/CPU/RAM/konkurentnost SVAKOG zahtjeva (vidi
// middleware/requestMetrics.middleware.js). Registrovano poslije morgan-a
// (samo za dev log), ali PRIJE ruta, kako bi obuhvatio i 404/error slučajeve.
app.use(requestMetricsMiddleware);

// ==========================================
// RUTE
// ==========================================
app.get("/", (req, res) => {
  res.json({
    message: "MovieLens Benchmark API - RavenDB vs OrientDB",
    status: "running",
  });
});

app.use("/api", routes);

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Ruta nije pronađena." });
});

// ==========================================
// GLOBALNI ERROR HANDLER
// ==========================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Interna serverska greška.",
  });
});

module.exports = app;
