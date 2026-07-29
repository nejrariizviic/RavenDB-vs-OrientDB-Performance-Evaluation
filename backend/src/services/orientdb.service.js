const { OrientDBClient } = require("orientjs");
const { orientdb: orientdbConfig } = require("../config/env.config");

/**
 * OrientDB servisni sloj.
 * Zadužen za uspostavljanje konekcije prema OrientDB serveru (OrientDBClient)
 * i otvaranje sesija (session) prema konkretnoj bazi, kao i za izvršavanje
 * osnovnih operacija (SELECT/INSERT/UPDATE/DELETE) potrebnih za benchmark analizu.
 *
 * Koristi noviji ("session-based") orientjs API:
 *   OrientDBClient.connect(...) -> client.session({ name, username, password })
 */

let clientPromise = null;

/**
 * Inicijalizuje/vraća konekciju prema OrientDB serveru (singleton, keširan promise).
 * Ne otvara sesiju prema konkretnoj bazi - samo uspostavlja klijent-server konekciju.
 */
function getOrientClient() {
  if (!clientPromise) {
    clientPromise = OrientDBClient.connect({
      host: orientdbConfig.host,
      port: orientdbConfig.port,
    });
  }
  return clientPromise;
}

/**
 * Otvara novu sesiju prema konkretnoj bazi podataka (MovieLens).
 * Svaku sesiju treba zatvoriti (session.close()) nakon upotrebe -
 * koristi se u ostalim servisima (npr. movie.service.js) za CRUD operacije.
 */
async function getOrientSession() {
  const client = await getOrientClient();
  return client.session({
    name: orientdbConfig.database,
    username: orientdbConfig.dbUsername,
    password: orientdbConfig.dbPassword,
  });
}

/**
 * Testira konekciju prema OrientDB bazi podataka: otvara sesiju i izvršava
 * jednostavan upit koji ne zavisi od postojanja specifičnih podataka.
 * @returns {Promise<{success: boolean, message: string, details?: object}>}
 */
async function testConnection() {
  let session = null;
  try {
    session = await getOrientSession();

    // Lightweight provjera - jednostavan upit koji potvrđuje da je
    // sesija prema OrientDB bazi uspješno uspostavljena.
    const result = await session.query("SELECT FROM OUser LIMIT 1").all();

    return {
      success: true,
      message: `Uspješno uspostavljena konekcija sa OrientDB bazom "${orientdbConfig.database}" na ${orientdbConfig.host}:${orientdbConfig.port}`,
      details: {
        host: orientdbConfig.host,
        port: orientdbConfig.port,
        database: orientdbConfig.database,
        sample: Array.isArray(result) ? result.length : undefined,
      },
    };
  } catch (error) {
    // Resetuj keširanu (neuspješnu) konekciju kako bi se naredni pokušaj
    // izvršio nad svježe kreiranim klijentom, a ne nad "polomljenim" connection-om.
    clientPromise = null;

    return {
      success: false,
      message: `Neuspješna konekcija sa OrientDB bazom: ${error.message}`,
      details: {
        host: orientdbConfig.host,
        port: orientdbConfig.port,
        database: orientdbConfig.database,
      },
    };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
  }
}

/**
 * Zatvara konekciju prema OrientDB serveru (npr. prilikom gašenja aplikacije).
 */
async function closeConnection() {
  if (clientPromise) {
    const client = await clientPromise.catch(() => null);
    if (client) {
      await client.close().catch(() => {});
    }
    clientPromise = null;
  }
}

module.exports = {
  getOrientClient,
  getOrientSession,
  testConnection,
  closeConnection,
};
