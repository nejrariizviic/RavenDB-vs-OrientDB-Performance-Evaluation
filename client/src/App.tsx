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
import { DEFAULT_QUERY_TYPE, type QueryType } from "./lib/queryType";

// movieId=1 -> "Toy Story (1995)" u standardnom MovieLens (ml-latest-small)
// dataset-u - razuman podrazumijevani ID koji stvarno postoji.
const DEFAULT_MOVIE_ID = "1";

// Isti podrazumijevani parametri kao na BE (vidi movie.controller.js ->
// getTopRatedMovies: limit=10, minRatings=50 kad query parametri izostanu).
const DEFAULT_LIMIT = "10";
const DEFAULT_MIN_RATINGS = "50";

function App() {
  const [dbEngine, setDbEngine] = useLocalStorageState<DbEngine>(
    DB_ENGINE_STORAGE_KEY,
    DEFAULT_DB_ENGINE
  );
  const [dbMode, setDbMode] = useLocalStorageState<DbMode>(
    DB_MODE_STORAGE_KEY,
    DEFAULT_DB_MODE
  );

  // Prekidač između JEDNOSTAVNOG (film po ID-u) i SLOŽENOG (Top N po ocjeni)
  // GET upita - NIJE u localStorage-u, vidi lib/queryType.ts.
  const [queryType, setQueryType] = useState<QueryType>(DEFAULT_QUERY_TYPE);

  // ---- JEDNOSTAVAN GET: film po ID-u ----
  // "movieIdInput" prati šta korisnik trenutno kuca u polju, "movieId" je
  // POSLJEDNJI POTVRĐENI id (Enter u polju ili klik na "Pošalji zahtjev").
  // Namjerno odvojeno od dbEngine/dbMode toggle-a: toggle-i odmah okidaju
  // novi zahtjev čim se promijene, ali kucanje ID-a ne treba slati zahtjev
  // na SVAKI pritisak tastera - samo kad je unos eksplicitno potvrđen.
  const [movieIdInput, setMovieIdInput] = useState(DEFAULT_MOVIE_ID);
  const [movieId, setMovieId] = useState(DEFAULT_MOVIE_ID);
  const [movieIdError, setMovieIdError] = useState<string | null>(null);

  // ---- SLOŽEN GET: Top N filmova po prosječnoj ocjeni, uz minimalan broj ocjena ----
  // Ista logika kao kod movieIdInput/movieId: "Input" polja prate kucanje,
  // a potvrđene vrijednosti se koriste za sastavljanje path-a.
  const [limitInput, setLimitInput] = useState(DEFAULT_LIMIT);
  const [minRatingsInput, setMinRatingsInput] = useState(DEFAULT_MIN_RATINGS);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [minRatings, setMinRatings] = useState(DEFAULT_MIN_RATINGS);
  const [topRatedError, setTopRatedError] = useState<string | null>(null);

  // NAPOMENA: "optimized" query parametar se šalje uz svaki zahtjev (i
  // jednostavan i složen), ali ga BE trenutno NE čita/koristi (env.config.js
  // ima samo JEDNU konfiguraciju po bazi, bez razlike optimizovano/
  // neoptimizovano) - toggle je pripremljen na frontendu i spreman za kad se
  // doda odgovarajuća podrška na BE (npr. druga baza/indeksi po engine-u).
  const path =
    queryType === "by-id"
      ? `/movies/${dbEngine}/${movieId}?optimized=${dbMode === "optimized"}`
      : `/movies/${dbEngine}/top-rated?limit=${limit}&minRatings=${minRatings}&optimized=${
          dbMode === "optimized"
        }`;

  const { result, error, loading, refetch } = useApi(path);

  function handleMovieIdSubmit(parsedId: number) {
    setMovieIdError(null);
    setTopRatedError(null);

    const normalized = String(parsedId);
    if (normalized === movieId) {
      // Isti ID kao prije - path se neće promijeniti (pa se efekat ne bi
      // sam ponovo pokrenuo), zato ovdje eksplicitno tražimo refetch().
      refetch();
    } else {
      setMovieId(normalized);
    }
  }

  function handleTopRatedSubmit(parsedLimit: number, parsedMinRatings: number) {
    setMovieIdError(null);
    setTopRatedError(null);

    const normalizedLimit = String(parsedLimit);
    const normalizedMinRatings = String(parsedMinRatings);
    if (normalizedLimit === limit && normalizedMinRatings === minRatings) {
      // Iste vrijednosti kao prije - path se neće promijeniti, zato
      // eksplicitno tražimo refetch() (isto kao kod jednostavnog GET-a).
      refetch();
    } else {
      setLimit(normalizedLimit);
      setMinRatings(normalizedMinRatings);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (queryType === "by-id") {
      const parsed = Number(movieIdInput);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setMovieIdError("ID filma mora biti pozitivan cijeli broj.");
        return;
      }
      handleMovieIdSubmit(parsed);
    } else {
      const parsedLimit = Number(limitInput);
      const parsedMinRatings = Number(minRatingsInput);

      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        setTopRatedError("'Top N' mora biti pozitivan cijeli broj.");
        return;
      }
      if (!Number.isInteger(parsedMinRatings) || parsedMinRatings < 0) {
        setTopRatedError("'Min. ocjena' mora biti nenegativan cijeli broj.");
        return;
      }
      handleTopRatedSubmit(parsedLimit, parsedMinRatings);
    }
  }

  function handleQueryTypeChange(next: QueryType) {
    setMovieIdError(null);
    setTopRatedError(null);
    setQueryType(next);
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
        queryType={queryType}
        onQueryTypeChange={handleQueryTypeChange}
        method="GET"
        url={`/api${path}`}
        loading={loading}
        networkError={error}
        status={result?.status ?? null}
        ok={result?.ok ?? null}
        body={result?.body}
        movieIdInput={movieIdInput}
        onMovieIdInputChange={setMovieIdInput}
        movieIdError={movieIdError}
        limitInput={limitInput}
        onLimitInputChange={setLimitInput}
        minRatingsInput={minRatingsInput}
        onMinRatingsInputChange={setMinRatingsInput}
        topRatedError={topRatedError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default App;
