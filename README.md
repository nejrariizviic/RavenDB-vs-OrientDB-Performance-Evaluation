# MovieLens Benchmark Backend — RavenDB vs OrientDB

Backend dio analitičke aplikacije za komparativnu benchmark analizu performansi
**RavenDB** (dokument baza) i **OrientDB** (multimodel baza) nad MovieLens dataset-om.

## Arhitektura

Projekat je organizovan u standardnom slojevitom (layered) obrascu:

```
backend/
├── package.json
├── package-lock.json
├── .env.example
├── src/
│   ├── server.js              # Ulazna tačka - pokretanje servera + provjera konekcija
│   ├── app.js                 # Express aplikacija (middleware, rute, error handling)
│   ├── config/
│   │   └── env.config.js      # Centralizovano čitanje environment varijabli
│   ├── services/
│   │   ├── ravendb.service.js   # Konekcija i operacije nad RavenDB (DocumentStore)
│   │   └── orientdb.service.js  # Konekcija i operacije nad OrientDB
│   ├── controllers/
│   │   └── connection.controller.js  # Health-check logika za obje baze
│   └── routes/
│       ├── index.js
│       └── connection.routes.js
```

**Princip slojeva:** `routes` → `controllers` → `services` → baza podataka.
Rute samo mapiraju HTTP endpointe na kontrolere; kontroleri obrađuju
HTTP request/response i pozivaju servise; servisi sadrže svu logiku
komunikacije sa RavenDB/OrientDB (konekcija, upiti, CRUD operacije).

Ovaj obrazac se koristi i za buduće benchmark module (npr. `movie.service.js`,
`benchmark.controller.js`) koji će izvršavati SELECT/INSERT/UPDATE/DELETE
upite nad MovieLens dataset-om u obje baze radi poređenja performansi.

## Instalacija

```bash
npm install
```

## Konfiguracija

Kopirati `.env.example` u `.env` i podesiti parametre konekcije prema
već postavljenim instancama baza:

```bash
cp .env.example .env
```

| Varijabla | Opis |
|---|---|
| `RAVENDB_URL` | URL RavenDB servera (npr. `http://127.0.0.1:8080`) |
| `RAVENDB_DATABASE` | Naziv baze (npr. `MovieLens`) |
| `ORIENTDB_HOST` / `ORIENTDB_PORT` | Adresa OrientDB servera (binary protokol, default port `2424`) |
| `ORIENTDB_USERNAME` / `ORIENTDB_PASSWORD` | Server-level kredencijali (root) |
| `ORIENTDB_DATABASE` | Naziv baze (npr. `MovieLens`) |
| `ORIENTDB_DB_USERNAME` / `ORIENTDB_DB_PASSWORD` | Kredencijali za pristup konkretnoj bazi |

## Pokretanje

```bash
npm start        # produkcijski način rada
npm run dev       # razvojni način rada (nodemon, auto-restart)
```

Prilikom pokretanja, aplikacija automatski pokušava uspostaviti konekciju
prema obje baze i u konzoli ispisuje status:

```
--- Provjera konekcija prema bazama podataka ---
✅ [RavenDB] Uspješno uspostavljena konekcija sa RavenDB bazom "MovieLens" na http://127.0.0.1:8080
✅ [OrientDB] Uspješno uspostavljena konekcija sa OrientDB bazom "MovieLens" na 127.0.0.1:2424
-------------------------------------------------

🚀 Server je pokrenut na portu 5000 (env: development)
```

Ukoliko neka baza nije dostupna, server i dalje nastavlja rad (ne ruši se),
a greška se jasno ispisuje u konzoli i vraća kroz odgovarajući endpoint.

## API endpointi (health-check)

| Metoda | Ruta | Opis |
|---|---|---|
| GET | `/api/connection/status` | Status konekcije prema **obje** baze istovremeno |
| GET | `/api/connection/ravendb` | Status konekcije prema RavenDB |
| GET | `/api/connection/orientdb` | Status konekcije prema OrientDB |

Primjer odgovora:

```json
{
  "success": true,
  "ravendb": {
    "success": true,
    "message": "Uspješno uspostavljena konekcija sa RavenDB bazom \"MovieLens\" na http://127.0.0.1:8080",
    "details": { "url": "http://127.0.0.1:8080", "database": "MovieLens" }
  },
  "orientdb": {
    "success": true,
    "message": "Uspješno uspostavljena konekcija sa OrientDB bazom \"MovieLens\" na 127.0.0.1:2424",
    "details": { "host": "127.0.0.1", "port": 2424, "database": "MovieLens" }
  }
}
```

## Sljedeći koraci

- Dodati `movie.service.js` (RavenDB) i `movie.service.js` (OrientDB) sa
  konkretnim SELECT/INSERT/UPDATE/DELETE operacijama nad MovieLens dataset-om.
- Dodati `benchmark.controller.js` i `benchmark.routes.js` koji mjere vrijeme
  izvršavanja upita (i, po potrebi, RAM/CPU potrošnju) i vraćaju rezultate
  frontend aplikaciji radi vizuelizacije poređenja.
- Odvojiti neoptimizovanu i optimizovanu (indeksiranu) varijantu upita,
  u skladu sa metodologijom iz istraživačkog rada.
