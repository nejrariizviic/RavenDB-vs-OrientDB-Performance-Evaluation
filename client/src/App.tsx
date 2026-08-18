import { useState, type FormEvent } from "react";
import { Sidebar } from "./components/Sidebar";
import { ResponsePanel } from "./components/ResponsePanel";
import { useApi } from "./hooks/useApi";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import {
  DB_ENGINE_STORAGE_KEY,
  DB_MODE_STORAGE_KEY,
  DEFAULT_DB_ENGINE,
  DEFAULT_DB_MODE,
  type DbEngine,
  type DbMode,
} from "./lib/dbPreferences";

// movieId=1 -> "Toy Story (1995)" u standardnom MovieLens (ml-latest-small)
// dataset-u - razuman podrazumijevani ID koji stvarno postoji.
const DEFAULT_MOVIE_ID = "1";

function App() {
  const [dbEngine, setDbEngine] = useLocalStorageState<DbEngine>(
    DB_ENGINE_STORAGE_KEY,
    DEFAULT_DB_ENGINE
  );
  const [dbMode, setDbMode] = useLocalStorageState<DbMode>(
    DB_MODE_STORAGE_KEY,
    DEFAULT_DB_MODE
  );

  // "movieIdInput" prati šta korisnik trenutno kuca u polju, "movieId" je
  // POSLJEDNJI POTVRĐENI id (Enter u polju ili klik na "Pošalji zahtjev").
  // Namjerno odvojeno od dbEngine/dbMode toggle-a: toggle-i odmah okidaju
  // novi zahtjev čim se promijene, ali kucanje ID-a ne treba slati zahtjev
  // na SVAKI pritisak tastera - samo kad je unos eksplicitno potvrđen.
  const [movieIdInput, setMovieIdInput] = useState(DEFAULT_MOVIE_ID);
  const [movieId, setMovieId] = useState(DEFAULT_MOVIE_ID);
  const [movieIdError, setMovieIdError] = useState<string | null>(null);

  // GET /api/movies/:dbEngine/:id - JEDNOSTAVAN GET upit: pronalazak filma
  // po ID-u (direktan load dokumenta po ključu kod RavenDB - ravenGetMovieById,
  // odnosno SELECT ... WHERE movieId = :movieId kod OrientDB -
  // orientGetMovieById - vidi movie.service.js na BE).
  //
  // NAPOMENA: "optimized" query parametar se šalje uz svaki zahtjev, ali ga
  // BE trenutno NE čita/koristi (env.config.js ima samo JEDNU konfiguraciju
  // po bazi, bez razlike optimizovano/neoptimizovano) - toggle je pripremljen
  // na frontendu i spreman za kad se doda odgovarajuća podrška na BE (npr.
  // druga baza/indeksi po engine-u).
  const path = `/movies/${dbEngine}/${movieId}?optimized=${dbMode === "optimized"}`;

  const { result, error, loading, refetch } = useApi(path);

  function handleMovieIdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = Number(movieIdInput);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setMovieIdError("ID filma mora biti pozitivan cijeli broj.");
      return;
    }

    setMovieIdError(null);

    const normalized = String(parsed);
    if (normalized === movieId) {
      // Isti ID kao prije - path se neće promijeniti (pa se efekat ne bi
      // sam ponovo pokrenuo), zato ovdje eksplicitno tražimo refetch().
      refetch();
    } else {
      setMovieId(normalized);
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-base-100 text-base-content">
      <Sidebar
        dbEngine={dbEngine}
        onDbEngineChange={setDbEngine}
        dbMode={dbMode}
        onDbModeChange={setDbMode}
        disabled={loading}
      />
      <ResponsePanel
        method="GET"
        url={`/api${path}`}
        loading={loading}
        networkError={error}
        status={result?.status ?? null}
        ok={result?.ok ?? null}
        body={result?.body}
        movieIdInput={movieIdInput}
        onMovieIdInputChange={setMovieIdInput}
        onSubmit={handleMovieIdSubmit}
        movieIdError={movieIdError}
      />
    </div>
  );
}

export default App;
