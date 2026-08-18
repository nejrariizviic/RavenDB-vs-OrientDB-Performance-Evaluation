/**
 * Zajedničke konstante i tipovi za dva nezavisna korisnička izbora koji se
 * pamte u localStorage-u i utiču na to koji se GET zahtjev šalje ka BE-u:
 *
 * 1. dbEngine -> koja baza se koristi (RavenDB ili OrientDB)
 * 2. dbMode   -> da li se koristi "optimizovana" ili "neoptimizovana" varijanta
 *                baze (backend trenutno ovaj parametar prima kao query string
 *                "?optimized=true|false", ali ga još ne koristi da bi
 *                stvarno mijenjao ciljnu bazu - vidi napomenu u App.tsx)
 */

export type DbEngine = "ravendb" | "orientdb";
export type DbMode = "optimized" | "unoptimized";

export const DB_ENGINE_STORAGE_KEY = "movielens-benchmark:db-engine";
export const DB_MODE_STORAGE_KEY = "movielens-benchmark:db-mode";

export const DEFAULT_DB_ENGINE: DbEngine = "ravendb";
export const DEFAULT_DB_MODE: DbMode = "optimized";
