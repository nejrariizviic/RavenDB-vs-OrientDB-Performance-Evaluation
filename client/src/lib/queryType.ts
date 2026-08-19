/**
 * Izbor između dva GET upita koje aplikacija demonstrira:
 * - "by-id"     -> JEDNOSTAVAN GET: pronađi film po ID-u
 * - "top-rated" -> SLOŽEN GET: Top N filmova po prosječnoj ocjeni,
 *                  uz minimalan broj ocjena (minRatings)
 *
 * NAPOMENA: "dodaj novi film" (JEDNOSTAVAN POST) NIJE ovdje - to više nije
 * treći tab, nego zaseban popup modal (vidi components/AddMovieModal.tsx),
 * otvoren dugmetom na "by-id" kartici, jer je to mutacija (kreira novi
 * resurs), a ne "pregled/pretraga" kao ova dva GET upita - vizualno i
 * konceptualno je jasnije odvojena od tab prekidača.
 *
 * Za razliku od dbEngine/dbMode, ovaj izbor se NAMJERNO ne pamti u
 * localStorage-u - to je samo prekidač između dva demo prikaza unutar iste
 * sesije, a ne korisnička preferenca vezana za bazu.
 */
export type QueryType = "by-id" | "top-rated";

export const DEFAULT_QUERY_TYPE: QueryType = "by-id";
