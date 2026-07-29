const app = require("./app");
const { app: appConfig } = require("./config/env.config");
const ravenDbService = require("./services/ravendb.service");
const orientDbService = require("./services/orientdb.service");

const PORT = appConfig.port;

/**
 * Ispisuje formatiran status konekcije u konzolu prilikom pokretanja servera.
 */
function logConnectionResult(dbName, result) {
  const icon = result.success ? "✅" : "❌";
  console.log(`${icon} [${dbName}] ${result.message}`);
}

/**
 * Inicijalizuje konekcije prema RavenDB i OrientDB bazama
 * i ispisuje status uspostavljanja konekcije u konzoli.
 */
async function verifyDatabaseConnections() {
  console.log("\n--- Provjera konekcija prema bazama podataka ---");

  ravenDbService.initRavenDBStore();
  const ravenResult = await ravenDbService.testConnection();
  logConnectionResult("RavenDB", ravenResult);

  const orientResult = await orientDbService.testConnection();
  logConnectionResult("OrientDB", orientResult);

  console.log("-------------------------------------------------\n");
}

/**
 * Pokreće HTTP server i vrši inicijalnu provjeru konekcija.
 */
async function startServer() {
  await verifyDatabaseConnections();

  app.listen(PORT, () => {
    console.log(`🚀 Server je pokrenut na portu ${PORT} (env: ${appConfig.env})`);
    console.log(`   Health-check: http://localhost:${PORT}/api/connection/status`);
  });
}

startServer().catch((error) => {
  console.error("Greška prilikom pokretanja servera:", error);
  process.exit(1);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on("SIGINT", async () => {
  console.log("\nGašenje servera - zatvaranje konekcija...");
  ravenDbService.closeStore();
  await orientDbService.closeConnection();
  process.exit(0);
});
