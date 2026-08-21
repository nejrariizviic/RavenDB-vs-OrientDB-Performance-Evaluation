/**
 * Zajednički tip i metapodaci za SVIH SEDAM demonstriranih zahtjeva ka BE-u -
 * koristi ih RequestTypeSelector.tsx (vizuelni birač u glavnom panelu) i
 * App.tsx (za odlučivanje koja forma / koji odgovor se prikazuje):
 *
 * - "by-id"           -> JEDNOSTAVAN GET:    pronađi film po ID-u
 * - "top-rated"       -> SLOŽEN GET:         Top N filmova po prosječnoj ocjeni
 * - "add-movie"       -> JEDNOSTAVAN POST:   dodaj novi film
 * - "add-rating"      -> SLOŽEN POST:        dodaj ocjenu SAMO ako korisnik i film već postoje
 * - "edit-title"      -> JEDNOSTAVAN PUT:    izmijeni naslov postojećeg filma po movieId
 * - "correct-ratings" -> SLOŽEN PUT:         korekcija ocjena za "aktivne" korisnike (>N ocjena)
 * - "delete-tag"      -> JEDNOSTAVAN DELETE: obriši jedan tag zapis po (userId, movieId, tag)
 *
 * Zamjenjuje raniji lib/queryType.ts (koji je pokrivao samo prva dva GET
 * upita) - "dodaj novi film" je ranije bio zaseban popup otvoren dugmetom sa
 * "by-id" kartice, a sad je i on (zajedno sa preostalim mutacijama) punopravna
 * stavka u istom vizuelnom biraču, umjesto običnih tabova.
 *
 * NAPOMENA: ovaj izbor se NAMJERNO ne pamti u localStorage-u (za razliku od
 * dbEngine/dbMode u lib/dbPreferences.ts) - to je samo prekidač između sedam
 * demo prikaza unutar iste sesije, a ne korisnička preferenca vezana za bazu.
 */
export type RequestKind =
  | "by-id"
  | "top-rated"
  | "add-movie"
  | "add-rating"
  | "edit-title"
  | "correct-ratings"
  | "delete-tag";

export const DEFAULT_REQUEST_KIND: RequestKind = "by-id";

export interface RequestKindMeta {
  kind: RequestKind;
  method: "GET" | "POST" | "PUT" | "DELETE";
  title: string;
  description: string;
  complexity: "simple" | "complex";
}

/**
 * Redoslijed ovdje određuje redoslijed kartica u RequestTypeSelector.tsx -
 * namjerno GET pa POST pa PUT pa DELETE, i unutar svake grupe jednostavan pa
 * složen upit (DELETE za sada ima samo jednostavnu varijantu - vidi
 * movie.routes.js za "orphan cleanup", složen DELETE koji BE već podržava,
 * ali koji još nije uveden u ovaj birač).
 */
export const REQUEST_KINDS: RequestKindMeta[] = [
  {
    kind: "by-id",
    method: "GET",
    title: "Film po ID-u",
    description: "Pronađi jedan film po movieId.",
    complexity: "simple",
  },
  {
    kind: "top-rated",
    method: "GET",
    title: "Top N po ocjeni",
    description: "Filmovi sa najvišom prosječnom ocjenom (uz min. broj ocjena).",
    complexity: "complex",
  },
  {
    kind: "add-movie",
    method: "POST",
    title: "Dodaj film",
    description: "Kreira novi film - odbija duplikat movieId (409).",
    complexity: "simple",
  },
  {
    kind: "add-rating",
    method: "POST",
    title: "Dodaj ocjenu",
    description: "Dodaje ocjenu SAMO ako korisnik i film već postoje.",
    complexity: "complex",
  },
  {
    kind: "edit-title",
    method: "PUT",
    title: "Izmijeni naslov",
    description: "Ažurira naslov postojećeg filma po movieId - odbija nepostojeći film (404).",
    complexity: "simple",
  },
  {
    kind: "correct-ratings",
    method: "PUT",
    title: "Korekcija ocjena",
    description: "Masovno koriguje niske ocjene \"aktivnih\" korisnika (>N ocjena) za zadatu deltu.",
    complexity: "complex",
  },
  {
    kind: "delete-tag",
    method: "DELETE",
    title: "Obriši tag",
    description: "Briše TAČNO JEDAN tag zapis po (userId, movieId, tag) - odbija nepostojeći zapis (404).",
    complexity: "simple",
  },
];
