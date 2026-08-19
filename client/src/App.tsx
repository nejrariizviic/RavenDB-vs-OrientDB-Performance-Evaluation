import { useState, type FormEvent } from "react";
import { Sidebar } from "./components/Sidebar";
import { ResponsePanel } from "./components/ResponsePanel";
import { AddMovieModal } from "./components/AddMovieModal";
import { AddRatingModal } from "./components/AddRatingModal";
import { EditMovieModal } from "./components/EditMovieModal";
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
import { DEFAULT_REQUEST_KIND, REQUEST_KINDS, type RequestKind } from "./lib/requestKind";

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

// Podrazumijevane vrijednosti za formu "dodaj ocjenu" (SLOŽEN POST, u popup
// modalu) - userId i movieId koji VJEROVATNO postoje u standardnom
// ml-latest-small dataset-u (korisnici 1-610, movieId=2 "Jumanji (1995)"),
// tako da prvi submit najčešće odmah uspije (201). Ako je baš ta
// kombinacija userId+movieId već ocijenjena, BE će to prijaviti kao 409
// (duplikat) - i to je i dalje koristan prikaz ponašanja ovog upita
// (demonstrira tačno onu provjeru zbog koje je upit "složen").
const DEFAULT_RATING_USER_ID = "1";
const DEFAULT_RATING_MOVIE_ID = "2";
const DEFAULT_RATING_VALUE = 4;

// Podrazumijevana vrijednost za formu "izmijeni naslov filma" (JEDNOSTAVAN
// PUT, u popup modalu) - namjerno ISTI movieId kao DEFAULT_MOVIE_ID (film
// koji sigurno postoji u standardnom ml-latest-small dataset-u), da prvi
// submit odmah uspije (200), a ne padne na 404 samo zato što je
// podrazumijevani ID izmišljen.
const DEFAULT_EDIT_MOVIE_ID = "1";

function App() {
  const [dbEngine, setDbEngine] = useLocalStorageState<DbEngine>(
    DB_ENGINE_STORAGE_KEY,
    DEFAULT_DB_ENGINE
  );
  const [dbMode, setDbMode] = useLocalStorageState<DbMode>(
    DB_MODE_STORAGE_KEY,
    DEFAULT_DB_MODE
  );

  // Prekidač između sva ČETIRI demonstrirana zahtjeva (2x GET, 2x POST) -
  // vidi lib/requestKind.ts. NIJE u localStorage-u (isti razlog kao ranije
  // "queryType" prekidač koji je ovo zamijenio - samo je sad proširen sa 2
  // na 4 vrijednosti, jer su "dodaj film" i novi "dodaj ocjenu" sad
  // punopravne stavke u istom vizuelnom biraču, a ne skriveni popup).
  const [requestKind, setRequestKind] = useState<RequestKind>(DEFAULT_REQUEST_KIND);

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

  // ---- SLOŽEN POST: dodaj ocjenu SAMO ako korisnik i film već postoje
  // (popup modal, vidi AddRatingModal.tsx) ----
  // Isti pattern kao "dodaj novi film" iznad (nema Input/potvrđena
  // razdvojenost - eksplicitan submit forme u modalu), ponovo koristi
  // GENERIČKI useApiMutation hook (isti kao za addMovie) - jedina razlika
  // je koji se path/payload šalje.
  const [isAddRatingModalOpen, setIsAddRatingModalOpen] = useState(false);
  const [addRatingUserIdInput, setAddRatingUserIdInput] = useState(DEFAULT_RATING_USER_ID);
  const [addRatingMovieIdInput, setAddRatingMovieIdInput] = useState(DEFAULT_RATING_MOVIE_ID);
  const [addRatingValue, setAddRatingValue] = useState(DEFAULT_RATING_VALUE);
  const [addRatingFormError, setAddRatingFormError] = useState<string | null>(null);
  const {
    result: addRatingResult,
    error: addRatingNetworkError,
    loading: addRatingLoading,
    mutate: addRating,
    reset: resetAddRating,
  } = useApiMutation();

  // ---- JEDNOSTAVAN PUT: izmijeni naslov postojećeg filma po movieId
  // (popup modal, vidi EditMovieModal.tsx) ----
  // Isti pattern kao "dodaj novi film"/"dodaj ocjenu" iznad (nema
  // Input/potvrđena razdvojenost - eksplicitan submit forme u modalu),
  // ponovo koristi GENERIČKI useApiMutation hook (sad proširen da radi i
  // PUT, ne samo POST - vidi hooks/useApiMutation.ts) - jedina razlika je
  // koji se path/payload/metoda šalje.
  const [isEditMovieModalOpen, setIsEditMovieModalOpen] = useState(false);
  const [editMovieIdInput, setEditMovieIdInput] = useState(DEFAULT_EDIT_MOVIE_ID);
  const [editMovieTitleInput, setEditMovieTitleInput] = useState("");
  const [editMovieFormError, setEditMovieFormError] = useState<string | null>(null);
  const {
    result: editMovieResult,
    error: editMovieNetworkError,
    loading: editMovieLoading,
    mutate: editMovieTitle,
    reset: resetEditMovie,
  } = useApiMutation();

  // NAPOMENA: "optimized" query parametar se šalje uz svaki zahtjev (GET,
  // POST i PUT), ali ga BE trenutno NE čita/koristi (env.config.js ima samo
  // JEDNU konfiguraciju po bazi, bez razlike optimizovano/neoptimizovano) -
  // toggle je pripremljen na frontendu i spreman za kad se doda
  // odgovarajuća podrška na BE (npr. druga baza/indeksi po engine-u).
  const optimizedParam = `optimized=${dbMode === "optimized"}`;

  const path =
    requestKind === "by-id"
      ? `/movies/${dbEngine}/${movieId}?${optimizedParam}`
      : `/movies/${dbEngine}/top-rated?limit=${limit}&minRatings=${minRatings}&${optimizedParam}`;

  const { result, error, loading, refetch } = useApi(path);

  // Path za POST "dodaj novi film" - zaseban od GET path-a iznad jer se ne
  // šalje automatski, nego samo preko mutate() na submit u modalu.
  const addMoviePath = `/movies/${dbEngine}?${optimizedParam}`;

  // Path za POST "dodaj ocjenu" (SLOŽEN POST) - vidi movie.routes.js:
  // POST /api/movies/:dbEngine/ratings.
  const addRatingPath = `/movies/${dbEngine}/ratings?${optimizedParam}`;

  // Path za PUT "izmijeni naslov filma" (JEDNOSTAVAN PUT) - vidi
  // movie.routes.js: PUT /api/movies/:dbEngine/:id (ISTI path oblik kao GET
  // po ID-u, vidi napomenu u movie.routes.js). Za razliku od addMoviePath/
  // addRatingPath (ID ide kroz body, path je stabilan), ovdje movieId ide
  // kroz SAMU putanju - zato je path izveden direktno iz trenutnog unosa
  // (editMovieIdInput), tako da se i URL prikazan u ResponsePanel.tsx i
  // dugme "Učitaj trenutni naslov" u modalu uvijek odnose na ID koji je
  // trenutno upisan u polju (bez posebne "Input"/"potvrđena" razdvojenosti,
  // isti duh kao kod addMoviePath/addRatingPath - eksplicitan submit).
  const editMoviePath = `/movies/${dbEngine}/${editMovieIdInput.trim() || "-"}?${optimizedParam}`;

  // ---- Objedinjeno "šta se prikazuje u glavnom panelu" - zavisi od
  // trenutno odabranog requestKind-a. GET upiti (by-id/top-rated) koriste
  // rezultat useApi hook-a iznad, dok mutacije (add-movie/add-rating/
  // edit-title) koriste rezultat svog useApiMutation hook-a -
  // ResponsePanel.tsx ne mora znati odakle dolazi, dobija samo jedan
  // objedinjen skup polja. ----
  const isGetKind = requestKind === "by-id" || requestKind === "top-rated";
  const isAddMovieKind = requestKind === "add-movie";
  const isAddRatingKind = requestKind === "add-rating";
  // edit-title je implicitni "else" ogranak u ternary lancima ispod (nema
  // sopstvene provjere jer je requestKind uvijek jedna od 5 poznatih
  // vrijednosti - vidi lib/requestKind.ts).

  // HTTP metoda se čita direktno iz REQUEST_KINDS metapodataka (jedan izvor
  // istine, dijeli ga i RequestTypeSelector.tsx) umjesto ručnog grananja po
  // svakom requestKind-u.
  const displayMethod = REQUEST_KINDS.find((meta) => meta.kind === requestKind)?.method ?? "GET";
  const displayUrl = isGetKind
    ? `/api${path}`
    : isAddMovieKind
      ? `/api${addMoviePath}`
      : isAddRatingKind
        ? `/api${addRatingPath}`
        : `/api${editMoviePath}`;
  const displayLoading = isGetKind
    ? loading
    : isAddMovieKind
      ? addMovieLoading
      : isAddRatingKind
        ? addRatingLoading
        : editMovieLoading;
  const displayNetworkError = isGetKind
    ? error
    : isAddMovieKind
      ? addMovieNetworkError
      : isAddRatingKind
        ? addRatingNetworkError
        : editMovieNetworkError;
  const displayResult = isGetKind
    ? result
    : isAddMovieKind
      ? addMovieResult
      : isAddRatingKind
        ? addRatingResult
        : editMovieResult;

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

    if (requestKind === "by-id") {
      const parsed = Number(movieIdInput);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setMovieIdError("ID filma mora biti pozitivan cijeli broj.");
        return;
      }
      handleMovieIdSubmit(parsed);
    } else if (requestKind === "top-rated") {
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
    // add-movie / add-rating nemaju formu ovdje - submit ide kroz zaseban
    // modal (handleAddMovieSubmit / handleAddRatingSubmit ispod).
  }

  function handleRequestKindChange(next: RequestKind) {
    setMovieIdError(null);
    setTopRatedError(null);
    setRequestKind(next);
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

  function openAddRatingModal() {
    setAddRatingFormError(null);
    resetAddRating();
    setIsAddRatingModalOpen(true);
  }

  function closeAddRatingModal() {
    setIsAddRatingModalOpen(false);
  }

  function handleAddAnotherRating() {
    setAddRatingFormError(null);
    resetAddRating();
    // Predloži sljedećeg korisnika (trenutni userId + 1), zadrži isti film
    // i vrati ocjenu na podrazumijevanu - isti duh kao handleAddAnotherMovie
    // (brzo dodavanje sljedeće ocjene bez ručnog mijenjanja svih polja).
    setAddRatingUserIdInput((prev) => String((Number(prev) || 0) + 1));
    setAddRatingValue(DEFAULT_RATING_VALUE);
  }

  function handleAddRatingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddRatingFormError(null);

    const parsedUserId = Number(addRatingUserIdInput);
    if (!Number.isInteger(parsedUserId) || parsedUserId < 1) {
      setAddRatingFormError("ID korisnika mora biti pozitivan cijeli broj.");
      return;
    }

    const parsedMovieId = Number(addRatingMovieIdInput);
    if (!Number.isInteger(parsedMovieId) || parsedMovieId < 1) {
      setAddRatingFormError("ID filma mora biti pozitivan cijeli broj.");
      return;
    }

    if (!Number.isFinite(addRatingValue) || addRatingValue < 0.5 || addRatingValue > 5) {
      setAddRatingFormError("Ocjena mora biti broj u opsegu 0.5 - 5.");
      return;
    }

    // BE ovdje NE prima "optimized" u body-ju (samo u query stringu kao i
    // ostali upiti) - vidi movie.controller.js -> addRating: čita
    // isključivo userId/movieId/rating iz req.body.
    void addRating(addRatingPath, {
      userId: parsedUserId,
      movieId: parsedMovieId,
      rating: addRatingValue,
    });
  }

  function openEditMovieModal() {
    // Svako otvaranje kreće "čisto" - prethodni rezultat (uspjeh/greška iz
    // ranije sesije) se ne vuče u novi pokušaj.
    setEditMovieFormError(null);
    resetEditMovie();
    setIsEditMovieModalOpen(true);
  }

  function closeEditMovieModal() {
    setIsEditMovieModalOpen(false);
  }

  function handleEditAnotherMovie() {
    setEditMovieFormError(null);
    resetEditMovie();
    // Predloži sljedeći ID (trenutni + 1) i očisti naslov, tako da korisnik
    // može brzo izmijeniti sljedeći film bez ručnog mijenjanja ID-a - isti
    // duh kao handleAddAnotherMovie/handleAddAnotherRating.
    setEditMovieIdInput((prev) => String((Number(prev) || 0) + 1));
    setEditMovieTitleInput("");
  }

  function handleEditMovieSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditMovieFormError(null);

    const parsedId = Number(editMovieIdInput);
    if (!Number.isInteger(parsedId) || parsedId < 1) {
      setEditMovieFormError("ID filma mora biti pozitivan cijeli broj.");
      return;
    }

    const trimmedTitle = editMovieTitleInput.trim();
    if (!trimmedTitle) {
      setEditMovieFormError("Novi naslov je obavezan.");
      return;
    }

    // editMoviePath je već izveden iz editMovieIdInput (vidi definiciju
    // iznad) - budući da je parsedId upravo taj isti unos, samo validiran,
    // path se ovdje ne mora ponovo sastavljati.
    void editMovieTitle(editMoviePath, { title: trimmedTitle }, "PUT");
  }

  return (
    <div className="min-h-screen w-full flex bg-base-100 text-base-content">
      <Sidebar
        dbEngine={dbEngine}
        onDbEngineChange={setDbEngine}
        dbMode={dbMode}
        onDbModeChange={setDbMode}
        disabled={loading || addMovieLoading || addRatingLoading || editMovieLoading}
      />
      <ResponsePanel
        requestKind={requestKind}
        onRequestKindChange={handleRequestKindChange}
        method={displayMethod}
        url={displayUrl}
        loading={displayLoading}
        networkError={displayNetworkError}
        status={displayResult?.status ?? null}
        ok={displayResult?.ok ?? null}
        body={displayResult?.body}
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
        onOpenAddRatingModal={openAddRatingModal}
        onOpenEditMovieModal={openEditMovieModal}
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

      <AddRatingModal
        open={isAddRatingModalOpen}
        onClose={closeAddRatingModal}
        userIdInput={addRatingUserIdInput}
        onUserIdInputChange={setAddRatingUserIdInput}
        movieIdInput={addRatingMovieIdInput}
        onMovieIdInputChange={setAddRatingMovieIdInput}
        rating={addRatingValue}
        onRatingChange={setAddRatingValue}
        formError={addRatingFormError}
        onSubmit={handleAddRatingSubmit}
        onAddAnother={handleAddAnotherRating}
        loading={addRatingLoading}
        networkError={addRatingNetworkError}
        status={addRatingResult?.status ?? null}
        ok={addRatingResult?.ok ?? null}
        body={addRatingResult?.body}
      />

      <EditMovieModal
        open={isEditMovieModalOpen}
        onClose={closeEditMovieModal}
        idInput={editMovieIdInput}
        onIdInputChange={setEditMovieIdInput}
        titleInput={editMovieTitleInput}
        onTitleInputChange={setEditMovieTitleInput}
        formError={editMovieFormError}
        onSubmit={handleEditMovieSubmit}
        onEditAnother={handleEditAnotherMovie}
        loading={editMovieLoading}
        networkError={editMovieNetworkError}
        status={editMovieResult?.status ?? null}
        ok={editMovieResult?.ok ?? null}
        body={editMovieResult?.body}
        lookupPath={editMoviePath}
      />
    </div>
  );
}

export default App;
