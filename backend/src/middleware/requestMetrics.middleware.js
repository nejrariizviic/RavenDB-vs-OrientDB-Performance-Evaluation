const metricsStore = require("../utils/metricsStore");

/**
 * Middleware koji za SVAKI HTTP zahtjev (bez obzira na rutu, uključujući
 * 404 i greške) mjeri:
 *   - trajanje obrade zahtjeva (od ulaska u middleware do poslatog odgovora)
 *   - potrošnju CPU-a Node procesa TOKOM tog zahtjeva (delta, ne kumulativno)
 *   - snapshot RAM-a Node procesa u trenutku završetka zahtjeva
 *   - broj KONKURENTNIH (istovremenih) zahtjeva - koliko ih je bilo aktivno
 *     u trenutku kad je OVAJ zahtjev started (uključujući njega)
 *
 * Rezultat se:
 *   1) ispisuje u konzolu kao jedna JSON linija (lako se grep-uje/loguje u fajl)
 *   2) čuva u in-memory metricsStore-u, dostupno preko GET /api/metrics/requests
 *
 * VAŽNO: ovo mjeri CIJELI HTTP request (routing + validacija + poziv baze +
 * serijalizacija odgovora) - odvojeno od "samo poziv bazi" metrike, koja se
 * mjeri unutar movie.controller.js (measure()) i tiče se ISKLJUČIVO poziva
 * servisnom sloju (DB pozivu).
 */
function requestMetricsMiddleware(req, res, next) {
  const startHr = process.hrtime.bigint();
  const cpuStart = process.cpuUsage();
  const concurrentAtStart = metricsStore.requestStarted();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
    const cpuDelta = process.cpuUsage(cpuStart); // { user, system } u mikrosekundama, DELTA
    const memAtFinish = process.memoryUsage();

    metricsStore.requestFinished();

    const record = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      route: req.route ? req.baseUrl + req.route.path : null,
      dbEngine: req.params ? req.params.dbEngine || null : null,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(3)),
      cpuUserMs: Number((cpuDelta.user / 1000).toFixed(3)),
      cpuSystemMs: Number((cpuDelta.system / 1000).toFixed(3)),
      concurrentRequests: concurrentAtStart,
      memoryAtFinish: {
        rssBytes: memAtFinish.rss,
        heapUsedBytes: memAtFinish.heapUsed,
        heapTotalBytes: memAtFinish.heapTotal,
      },
    };

    metricsStore.addRequestMetric(record);

    // Jedna JSON linija po requestu - lako se prati uživo u terminalu
    // (npr. `npm run dev | grep REQ_METRIC`) ili preusmjeri u fajl za analizu.
    console.log("REQ_METRIC", JSON.stringify(record));
  });

  next();
}

module.exports = requestMetricsMiddleware;
