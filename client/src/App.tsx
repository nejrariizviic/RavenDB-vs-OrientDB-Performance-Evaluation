import { useState, type FormEvent } from "react";
import { Sidebar } from "./components/Sidebar";
import { ResponsePanel } from "./components/ResponsePanel";
import { AddMovieModal } from "./components/AddMovieModal";
import { useApi } from "./hooks/useApi";
import { useApiMutation } from "./hooks/useApiMutation";
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

// Podrazumijevana vrijednost za formu "dodaj novi film" (u popup modalu) -
// namjerno movieId koji sigurno NE postoji u standardnom ml-latest-small
// dataset-u (najveći izvorni movieId je ispod 200000), da prvi submit
// odmah uspije (201), a ne padne na 409 (duplikat) samo zato što je
// podrazumijevani ID slučajno zauzet.
const DEFAULT_ADD_MOVIE_ID = "200001";

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

  // ---- JEDNOSTAVAN POST: dodaj novi film (popup modal, vidi AddMovieModal.tsx) ----
  // Za razliku od GET formi iznad, ovdje NEMA razdvajanja na "Input" i
  // "potvrđenu" vrijednost - POST je mutacija i NIKAD se ne šalje sam od
  // sebe (ni na promjenu dbEngine/dbMode toggle-a, ni na promjenu ovih
  // polja), nego SAMO na eksplicitan submit forme unutar modala.
  const [isAddMovieModalOpen, setIsAddMovieModalOpen] = useState(false);
  const [addMovieIdInput, setAddMovieIdInput] = useState(DEFAULT_ADD_MOVIE_ID);
  const [addMovieTitleInput, setAddMovieTitleInput] = useState("");
  const [addMovieGenresInput, setAddMovieGenresInput] = useState("");
  const [addMovieFormError, setAddMovieFormError] = useState<string | null>(null);
  const {
    result: addMovieResult,
    error: addMovieNetworkError,
    loading: addMovieLoading,
    mutate: addMovie,
    reset: resetAddMovie,
  } = useApiMutation();

  // NAPOMENA: "optimized" query parametar se šalje uz svaki zahtjev (GET i
  // POST), ali ga BE trenutno NE čita/koristi (env.config.js ima samo JEDNU
  // konfiguraciju po bazi, bez razlike optimizovano/neoptimizovano) -
  // toggle je pripremljen na frontendu i spreman za kad se doda
  // odgovarajuća podrška na BE (npr. druga baza/indeksi po engine-u).
  const optimizedParam = `optimized=${dbMode === "optimized"}`;

  const path =
    queryType === "by-id"
      ? `/movies/${dbEngine}/${movieId}?${optimizedParam}`
      : `/movies/${dbEngine}/top-rated?limit=${limit}&minRatings=${minRatings}&${optimizedParam}`;

  const { result, error, loading, refetch } = useApi(path);

  // Path za POST "dodaj novi film" - zaseban od GET path-a iznad jer se ne
  // šalje automatski, nego samo preko mutate() na submit u modalu.
  const addMoviePath = `/movies/${dbEngine}?${optimizedParam}`;

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

  function openAddMovieModal() {
    // Svako otvaranje kreće "čisto" - prethodni rezultat (uspjeh/greška iz
    // ranije sesije) se ne vuče u novi pokušaj.
    setAddMovieFormError(null);
    resetAddMovie();
    setIsAddMovieModalOpen(true);
  }

  function closeAddMovieModal() {
    setIsAddMovieModalOpen(false);
  }

  function handleAddAnotherMovie() {
    setAddMovieFormError(null);
    resetAddMovie();
    // Predloži sljedeći ID (trenutni + 1) i očisti ostala polja, tako da
    // korisnik može brzo dodati novi film bez ručnog mijenjanja ID-a.
    setAddMovieIdInput((prev) => String((Number(prev) || 0) + 1));
    setAddMovieTitleInput("");
    setAddMovieGenresInput("");
  }

  function handleAddMovieSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddMovieFormError(null);

    const parsedId = Number(addMovieIdInput);
    if (!Number.isInteger(parsedId) || parsedId < 1) {
      setAddMovieFormError("ID filma mora biti pozitivan cijeli broj.");
      return;
    }

    const trimmedTitle = addMovieTitleInput.trim();
    if (!trimmedTitle) {
      setAddMovieFormError("Naslov filma je obavezan.");
      return;
    }

    const trimmedGenres = addMovieGenresInput.trim();

    void addMovie(addMoviePath, {
      movieId: parsedId,
      title: trimmedTitle,
      // Prazan string se NAMJERNO šalje kao "undefined" (izostavljeno iz
      // JSON tijela) umjesto "" - BE tretira genres kao opciono polje, a
      // prazan string bi se inače upisao u bazu kao stvarna (prazna)
      // vrijednost umjesto da polje jednostavno izostane.
      genres: trimmedGenres.length > 0 ? trimmedGenres : undefined,
    });
  }

  return (
    <div className="min-h-screen w-full flex bg-base-100 text-base-content">
      <Sidebar
        dbEngine={dbEngine}
        onDbEngineChange={setDbEngine}
        dbMode={dbMode}
        onDbModeChange={setDbMode}
        disabled={loading || addMovieLoading}
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
        onOpenAddMovieModal={openAddMovieModal}
      />

      <AddMovieModal
        open={isAddMovieModalOpen}
        onClose={closeAddMovieModal}
        idInput={addMovieIdInput}
        onIdInputChange={setAddMovieIdInput}
        titleInput={addMovieTitleInput}
        onTitleInputChange={setAddMovieTitleInput}
        genresInput={addMovieGenresInput}
        onGenresInputChange={setAddMovieGenresInput}
        formError={addMovieFormError}
        onSubmit={handleAddMovieSubmit}
        onAddAnother={handleAddAnotherMovie}
        loading={addMovieLoading}
        networkError={addMovieNetworkError}
        status={addMovieResult?.status ?? null}
        ok={addMovieResult?.ok ?? null}
        body={addMovieResult?.body}
      />
    </div>
  );
}

export default App;
