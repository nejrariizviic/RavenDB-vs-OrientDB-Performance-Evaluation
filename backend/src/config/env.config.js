require("dotenv").config();

/**
 * Centralizovana konfiguracija okruženja.
 * Sve vrijednosti se čitaju iz .env fajla (vidi .env.example).
 */
module.exports = {
  app: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
  },

  ravendb: {
    url: process.env.RAVENDB_URL || "http://127.0.0.1:8080",
    database: process.env.RAVENDB_DATABASE || "MovieLens",
    certPath: process.env.RAVENDB_CERT_PATH || null,
  },

  orientdb: {
    host: process.env.ORIENTDB_HOST || "127.0.0.1",
    port: Number(process.env.ORIENTDB_PORT) || 2424,
    username: process.env.ORIENTDB_USERNAME || "root",
    password: process.env.ORIENTDB_PASSWORD || "root",
    database: process.env.ORIENTDB_DATABASE || "MovieLens",
    dbUsername: process.env.ORIENTDB_DB_USERNAME || "admin",
    dbPassword: process.env.ORIENTDB_DB_PASSWORD || "admin",
  },
};
