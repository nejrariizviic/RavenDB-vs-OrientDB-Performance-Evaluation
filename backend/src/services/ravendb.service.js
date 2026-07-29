const { DocumentStore } = require("ravendb");
const { ravendb: ravendbConfig } = require("../config/env.config");

/**
 * RavenDB servisni sloj.
 * Zadužen za uspostavljanje i održavanje konekcije (DocumentStore)
 * prema RavenDB instanci, kao i za izvršavanje osnovnih operacija
 * potrebnih za benchmark analizu (SELECT/INSERT/UPDATE/DELETE).
 */

let documentStore = null;

/**
 * Inicijalizuje RavenDB DocumentStore (singleton).
 * DocumentStore se inicijalizuje samo jednom prilikom podizanja aplikacije
 * i dalje se ponovo koristi kroz sesije (openSession).
 */
function initRavenDBStore() {
  if (documentStore) {
    return documentStore;
  }

  documentStore = new DocumentStore(
    [ravendbConfig.url],
    ravendbConfig.database
  );

  // Opciono: konfiguracija sertifikata ukoliko RavenDB server radi u secure modu
  if (ravendbConfig.certPath) {
    // eslint-disable-next-line global-require
    const fs = require("fs");
    documentStore.authOptions = {
      certificate: fs.readFileSync(ravendbConfig.certPath),
      type: "pfx",
    };
  }

  documentStore.initialize();
  return documentStore;
}

/**
 * Vraća inicijalizovan DocumentStore. Ako store ne postoji, inicijalizuje ga.
 */
function getStore() {
  if (!documentStore) {
    return initRavenDBStore();
  }
  return documentStore;
}

/**
 * Testira konekciju prema RavenDB bazi tako što šalje zahtjev
 * za statistiku baze podataka (lightweight operacija, ne zavisi od podataka).
 * @returns {Promise<{success: boolean, message: string, details?: object}>}
 */
async function testConnection() {
  try {
    const store = getStore();
    const session = store.openSession();

    // Lightweight provjera - pokušaj učitavanja nepostojećeg dokumenta.
    // RavenDB u ovom slučaju vraća null (bez greške), ali sam odgovor
    // potvrđuje da je HTTP komunikacija sa RavenDB serverom uspješno uspostavljena.
    await session.load("connection-check/health-probe");

    return {
      success: true,
      message: `Uspješno uspostavljena konekcija sa RavenDB bazom "${ravendbConfig.database}" na ${ravendbConfig.url}`,
      details: {
        url: ravendbConfig.url,
        database: ravendbConfig.database,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Neuspješna konekcija sa RavenDB bazom: ${error.message}`,
      details: {
        url: ravendbConfig.url,
        database: ravendbConfig.database,
      },
    };
  }
}

/**
 * Otvara novu RavenDB sesiju - koristi se u ostalim servisima
 * (npr. movie.service.js) za izvršavanje CRUD operacija nad MovieLens dataset-om.
 */
function openSession() {
  const store = getStore();
  return store.openSession();
}

/**
 * Zatvara DocumentStore (npr. prilikom gašenja aplikacije).
 */
function closeStore() {
  if (documentStore) {
    documentStore.dispose();
    documentStore = null;
  }
}

module.exports = {
  initRavenDBStore,
  getStore,
  // Alias - isti naziv koji se koristi u ostatku projekta (npr. movie modeli)
  getRavenStore: getStore,
  testConnection,
  openSession,
  closeStore,
};
