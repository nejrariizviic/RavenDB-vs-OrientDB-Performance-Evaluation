import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiGet } from "../api/client";
import { isMovieQuerySuccess, MovieQueryResult } from "./MovieQueryResult";
import { PencilIcon, SearchIcon } from "./icons";

interface EditMovieModalProps {
  open: boolean;
  onClose: () => void;

  idInput: string;
  onIdInputChange: (value: string) => void;
  titleInput: string;
  onTitleInputChange: (value: string) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Izmijeni još jedan film" - resetuje rezultat i formu, ali OSTAVLJA modal otvoren. */
  onEditAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;

  /**
   * Path oblika "/movies/:dbEngine/:id?optimized=..." - ISTI oblik koji na
   * BE-u opslužuju i GET (getMovieById) i PUT (updateMovieTitle), vidi
   * movie.routes.js. Ovdje se koristi za dugme "Učitaj trenutni naslov"
   * (samostalan GET poziv, radi pregleda PRIJE izmjene) - App.tsx isti
   * string prosljeđuje kao cilj samog PUT zahtjeva na submit.
   */
  lookupPath: string;
}

/** Izvlači poruku o grešci iz JSON tijela BE odgovora (vidi movie.controller.js - svaki neuspješan odgovor ima "message"). */
function extractErrorMessage(body: unknown, status: number | null): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Zahtjev nije uspio (HTTP ${status ?? "?"}).`;
}

/**
 * Popup (modal) za JEDNOSTAVAN PUT upit - izmjena naslova postojećeg filma.
 * Strukturno isti pattern kao AddMovieModal.tsx/AddRatingModal.tsx (nativni
 * <dialog>, isti tok uspjeh/greška), sa dvije razlike specifičnim za PUT:
 *
 * 1. movieId je dio same PUTANJE (ne body-ja) - vidi movie.routes.js:
 *    PUT /api/movies/:dbEngine/:id - pa "lookupPath" prop dolazi iz App.tsx
 *    već sastavljen sa trenutnim unosom ID-a.
 * 2. Dugme "Učitaj trenutni naslov" - budući da je ovo IZMJENA postojećeg
 *    resursa (za razliku od POST-a koji kreira nov), korisno je prvo
 *    vidjeti šta se trenutno mijenja. Ovo je namjerno SAMOSTALAN GET poziv
 *    (ne ide kroz useApi/useApiMutation), jer je čisto pomoćni pregled
 *    unutar modala, a ne "glavni" prikazani zahtjev.
 */
export function EditMovieModal({
  open,
  onClose,
  idInput,
  onIdInputChange,
  titleInput,
  onTitleInputChange,
  formError,
  onSubmit,
  onEditAnother,
  loading,
  networkError,
  status,
  ok,
  body,
  lookupPath,
}: EditMovieModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);

  async function handleLookupCurrentTitle() {
    setLookupError(null);
    setLookupNotice(null);
    setLookupLoading(true);
    try {
      const res = await apiGet(lookupPath);
      if (res.ok && isMovieQuerySuccess(res.body)) {
        onTitleInputChange(res.body.data.title);
        setLookupNotice(
          `Trenutni naslov ("${res.body.data.title}") je učitan ispod - izmijeni ga i sačuvaj.`
        );
      } else {
        setLookupError(
          res.status === 404
            ? "Film sa ovim ID-jem nije pronađen u odabranoj bazi."
            : "Film nije pronađen ili ID nije validan."
        );
      }
    } catch {
      setLookupError("Zahtjev nije stigao do servera.");
    } finally {
      setLookupLoading(false);
    }
  }

  // Uspješna izmjena - HTTP 200 (NE 201 kao kod POST-a, jer se resurs već
  // postojao, samo je ažuriran) - isti oblik odgovora kao GET
  // /movies/:dbEngine/:id, pa se ponovo koristi POSTOJEĆI MovieQueryResult
  // prikaz (kartica filma + metrike) umjesto dupliranja markup-a.
  const isSuccess = ok === true && status === 200 && isMovieQuerySuccess(body);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-lg">
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
          onClick={() => dialogRef.current?.close()}
          aria-label="Zatvori"
        >
          ✕
        </button>

        <h3 className="font-bold text-lg flex items-center gap-2">
          <PencilIcon className="h-5 w-5 text-warning" />
          Izmijeni naslov filma
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Jednostavan PUT upit - ažurira SAMO naslov postojećeg filma (vidi toggle u sidebaru za
          bazu); ako film sa datim movieId ne postoji, zahtjev se odbija (404).
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="alert alert-success">
              <span>
                Naslov filma (movieId: {body.data.movieId}) je uspješno izmijenjen u "
                {body.data.title}".
              </span>
            </div>

            <MovieQueryResult body={body} />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onEditAnother}>
                <PencilIcon className="h-4 w-4" />
                Izmijeni još jedan film
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Zatvori
              </button>
            </div>
          </div>
        ) : (
          <>
            <form id="edit-movie-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  ID filma (movieId)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="npr. 1"
                    className="input input-bordered w-full"
                    value={idInput}
                    onChange={(event) => {
                      onIdInputChange(event.target.value);
                      setLookupNotice(null);
                      setLookupError(null);
                    }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost gap-1.5 whitespace-nowrap"
                    onClick={() => void handleLookupCurrentTitle()}
                    disabled={loading || lookupLoading || !idInput}
                  >
                    {lookupLoading ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <SearchIcon className="h-4 w-4" />
                    )}
                    Učitaj trenutni naslov
                  </button>
                </div>
              </label>

              {lookupNotice && <p className="text-success text-xs -mt-2">{lookupNotice}</p>}
              {lookupError && <p className="text-error text-xs -mt-2">{lookupError}</p>}

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Novi naslov
                </span>
                <input
                  type="text"
                  placeholder="npr. Toy Story (1995)"
                  className="input input-bordered w-full"
                  value={titleInput}
                  onChange={(event) => onTitleInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>
            </form>

            {formError && <p className="text-error text-xs mt-3">{formError}</p>}

            {networkError && !loading && (
              <div role="alert" className="alert alert-error mt-3">
                <span>Zahtjev nije stigao do servera: {networkError}</span>
              </div>
            )}

            {status !== null && !ok && !networkError && !loading && (
              <div role="alert" className="alert alert-error mt-3">
                <span>{extractErrorMessage(body, status)}</span>
              </div>
            )}

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Otkaži
              </button>
              <button
                type="submit"
                form="edit-movie-form"
                className="btn btn-primary btn-sm"
                disabled={loading}
              >
                {loading && <span className="loading loading-spinner loading-xs" />}
                Sačuvaj izmjenu
              </button>
            </div>
          </>
        )}
      </div>

      {/* Klik na pozadinu zatvara modal - isti daisyUI pattern kao AddMovieModal.tsx. */}
      <form method="dialog" className="modal-backdrop">
        <button>zatvori</button>
      </form>
    </dialog>
  );
}
