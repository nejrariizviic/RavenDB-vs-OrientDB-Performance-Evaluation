const ravenDbService = require("../services/ravendb.service");
const orientDbService = require("../services/orientdb.service");

/**
 * Kontroler zadužen za provjeru statusa konekcije prema bazama podataka.
 * Koristi se za inicijalnu validaciju da su RavenDB i OrientDB dostupni
 * prije nego što se pokrenu benchmark upiti.
 */

/**
 * GET /api/connection/ravendb
 * Provjerava i vraća status konekcije prema RavenDB bazi.
 */
async function checkRavenDbConnection(req, res) {
  const result = await ravenDbService.testConnection();
  console.log(`[RavenDB] ${result.message}`);
  return res.status(result.success ? 200 : 500).json(result);
}

/**
 * GET /api/connection/orientdb
 * Provjerava i vraća status konekcije prema OrientDB bazi.
 */
async function checkOrientDbConnection(req, res) {
  const result = await orientDbService.testConnection();
  console.log(`[OrientDB] ${result.message}`);
  return res.status(result.success ? 200 : 500).json(result);
}

/**
 * GET /api/connection/status
 * Provjerava status konekcije prema objema bazama istovremeno.
 * Koristan endpoint za dashboard analitičke aplikacije.
 */
async function checkAllConnections(req, res) {
  const [ravendb, orientdb] = await Promise.all([
    ravenDbService.testConnection(),
    orientDbService.testConnection(),
  ]);

  console.log(`[RavenDB] ${ravendb.message}`);
  console.log(`[OrientDB] ${orientdb.message}`);

  const overallSuccess = ravendb.success && orientdb.success;

  return res.status(overallSuccess ? 200 : 207).json({
    success: overallSuccess,
    ravendb,
    orientdb,
  });
}

module.exports = {
  checkRavenDbConnection,
  checkOrientDbConnection,
  checkAllConnections,
};
