const ravenDbService = require("../services/ravendb.service");
const orientDbService = require("../services/orientdb.service");

const SUPPORTED_ENGINES = ["ravendb", "orientdb"];

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

// ==========================================
// TROŠAK OTVARANJA/ZATVARANJA SESIJE (konekcije) PO BAZI
// ==========================================

/**
 * Otvara i odmah zatvara JEDNU RavenDB sesiju, mjereći odvojeno trajanje
 * otvaranja i trajanje zatvaranja.
 *
 * NAPOMENA: RavenDB `store.openSession()` je sinhrona, lokalna operacija
 * (kreira Unit-of-Work objekat, NE ide na mrežu) - `session.dispose()` je
 * isto lokalna operacija (čisti interno stanje sesije). Kod RavenDB-a se
 * stvarna HTTP komunikacija dešava tek kod load/query/saveChanges, ne kod
 * open/dispose - zato su ovdje očekivana vremena vrlo mala (mikrosekunde).
 * Ovo je namjerno tako izmjereno (upravo TA razlika u odnosu na OrientDB je
 * bitno zapažanje za rad - vidi orientSessionCostOnce niže).
 *
 * @returns {Promise<{openMs:number, closeMs:number}>}
 */
async function ravenSessionCostOnce() {
  const openStart = process.hrtime.bigint();
  const session = ravenDbService.openSession();
  const openMs = Number(process.hrtime.bigint() - openStart) / 1e6;

  const closeStart = process.hrtime.bigint();
  session.dispose();
  const closeMs = Number(process.hrtime.bigint() - closeStart) / 1e6;

  return { openMs, closeMs };
}

/**
 * Otvara i odmah zatvara JEDNU OrientDB sesiju, mjereći odvojeno trajanje
 * otvaranja i trajanje zatvaranja.
 *
 * NAPOMENA: za razliku od RavenDB-a, `getOrientSession()` (interno
 * `client.session({...})`) izvodi STVARAN network handshake sa OrientDB
 * serverom preko binarnog protokola, kao i `session.close()` - zato su ovdje
 * očekivana vremena znatno veća (milisekunde) nego kod RavenDB-a. Ova
 * razlika NIJE greška mjerenja, nego stvarna arhitekturalna razlika između
 * dva drivera/enginea - obavezno komentarisati u analizi rezultata.
 *
 * @returns {Promise<{openMs:number, closeMs:number}>}
 */
async function orientSessionCostOnce() {
  const openStart = process.hrtime.bigint();
  const session = await orientDbService.getOrientSession();
  const openMs = Number(process.hrtime.bigint() - openStart) / 1e6;

  const closeStart = process.hrtime.bigint();
  await session.close().catch(() => {});
  const closeMs = Number(process.hrtime.bigint() - closeStart) / 1e6;

  return { openMs, closeMs };
}

/**
 * Računa min/max/prosjek (average) za niz brojeva. Pomoćna funkcija za
 * agregaciju rezultata kod više ponovljenih mjerenja (vidi `runs` niže).
 * @param {number[]} values
 */
function summarize(values) {
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    avgMs: Number((sum / values.length).toFixed(3)),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

/**
 * GET /api/connection/session-cost/:dbEngine?runs=5
 * :dbEngine -> "ravendb" ili "orientdb"
 *
 * Mjeri trošak otvaranja i zatvaranja JEDNE sesije/konekcije ka bazi,
 * ponovljeno `runs` puta (podrazumijevano 5, maksimalno 50) radi
 * stabilnijeg (prosječnog) rezultata - pojedinačno mjerenje je podložno
 * šumu (npr. prvi poziv može biti sporiji zbog "zagrijavanja" TCP/HTTP
 * konekcije, JIT-a i sl.).
 *
 * Radi identično (isti handler, ista mjerna metoda) za obje baze - jedino
 * se razlikuje interna implementacija open/close poziva (vidi
 * ravenSessionCostOnce / orientSessionCostOnce iznad), čime je rezultat
 * direktno uporediv RavenDB vs OrientDB.
 *
 * Odgovor sadrži i pojedinačna mjerenja (`runsData`), za slučaj da treba
 * dalja statistička obrada (npr. percentili) van servera.
 */
async function testSessionCost(req, res, next) {
  try {
    const { dbEngine } = req.params;

    if (!SUPPORTED_ENGINES.includes(dbEngine)) {
      return res.status(400).json({
        success: false,
        message: `Nepoznat 'dbEngine': '${dbEngine}'. Dozvoljeno: ${SUPPORTED_ENGINES.join(", ")}.`,
      });
    }

    const requestedRuns = req.query.runs !== undefined ? Number(req.query.runs) : 5;
    if (!Number.isInteger(requestedRuns) || requestedRuns < 1) {
      return res.status(400).json({
        success: false,
        message: "Query parametar 'runs' mora biti pozitivan cijeli broj.",
      });
    }
    const runs = Math.min(requestedRuns, 50);

    const sessionCostFn = dbEngine === "ravendb" ? ravenSessionCostOnce : orientSessionCostOnce;

    const runsData = [];
    for (let i = 0; i < runs; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { openMs, closeMs } = await sessionCostFn();
      runsData.push({
        run: i + 1,
        openMs: Number(openMs.toFixed(3)),
        closeMs: Number(closeMs.toFixed(3)),
        totalMs: Number((openMs + closeMs).toFixed(3)),
      });
    }

    const openValues = runsData.map((r) => r.openMs);
    const closeValues = runsData.map((r) => r.closeMs);

    return res.status(200).json({
      success: true,
      engine: dbEngine,
      runs,
      open: summarize(openValues),
      close: summarize(closeValues),
      runsData,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkRavenDbConnection,
  checkOrientDbConnection,
  checkAllConnections,
  testSessionCost,
};
