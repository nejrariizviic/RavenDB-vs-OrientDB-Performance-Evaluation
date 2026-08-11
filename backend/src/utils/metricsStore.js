/**
 * In-memory skladište za metrike prikupljene tokom rada servera.
 *
 * NAMJERNO jednostavno (bez baze/fajla) - dovoljno za benchmark session:
 * drži posljednjih MAX_ENTRIES zapisa u memoriji (ring buffer), plus
 * trenutni broj konkurentnih (aktivnih) HTTP zahtjeva. Restartom servera
 * se briše - ako treba trajno čuvanje, ovo je mjesto gdje dodati upis u
 * fajl/DB (vidi addRequestMetric niže).
 */

const MAX_ENTRIES = 2000;

/** @type {Array<object>} */
const requestMetrics = [];

let concurrentRequests = 0;

/**
 * Poziva se kad request UĐE u middleware (prije obrade).
 * @returns {number} broj konkurentnih zahtjeva U TOM TRENUTKU (uključujući ovaj)
 */
function requestStarted() {
  concurrentRequests += 1;
  return concurrentRequests;
}

/**
 * Poziva se kad request ZAVRŠI (response poslat).
 */
function requestFinished() {
  concurrentRequests = Math.max(0, concurrentRequests - 1);
}

/**
 * Trenutni broj konkurentnih (još neodgovorenih) HTTP zahtjeva.
 */
function getConcurrentRequests() {
  return concurrentRequests;
}

/**
 * Dodaje jedan zapis metrike za završen HTTP request (middleware nivo).
 * Ring buffer - kad se pređe MAX_ENTRIES, briše se najstariji zapis.
 * @param {object} record
 */
function addRequestMetric(record) {
  requestMetrics.push(record);
  if (requestMetrics.length > MAX_ENTRIES) {
    requestMetrics.shift();
  }
}

/**
 * Vraća posljednjih `limit` zapisa (podrazumijevano svi, max MAX_ENTRIES).
 * @param {number} [limit]
 */
function getRequestMetrics(limit) {
  if (!limit || limit >= requestMetrics.length) {
    return requestMetrics.slice();
  }
  return requestMetrics.slice(requestMetrics.length - limit);
}

/**
 * Briše sve prikupljene request metrike (korisno da "resetuješ" prije
 * novog benchmark run-a bez restarta servera).
 */
function clearRequestMetrics() {
  requestMetrics.length = 0;
}

module.exports = {
  requestStarted,
  requestFinished,
  getConcurrentRequests,
  addRequestMetric,
  getRequestMetrics,
  clearRequestMetrics,
};
