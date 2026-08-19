import { useEffect, useRef, type FormEvent } from "react";
import { isMovieQuerySuccess, MovieQueryResult } from "./MovieQueryResult";
import { PlusIcon } from "./icons";

interface AddMovieModalProps {
  open: boolean;
  onClose: () => void;

  idInput: string;
  onIdInputChange: (value: string) => void;
  titleInput: string;
  onTitleInputChange: (value: string) => void;
  genresInput: string;
  onGenresInputChange: (value: string) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Dodaj još jedan film" - resetuje rezultat i formu, ali OSTAVLJA modal otvoren. */
  onAddAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;
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
 * Popup (modal) za JEDNOSTAVAN POST upit - dodavanje novog filma. Otvara se
 * dugmetom na "by-id" (jednostavan GET) kartici u ResponsePanel.tsx, jer je
 * riječ o mutaciji (kreira novi resurs), a ne o "pregledu/pretrazi" kao GET
 * tabovi - zato je vizualno i konceptualno odvojen od tab prekidača.
 *
 * Implementirano preko nativnog <dialog> elementa (uz daisyUI "modal"
 * klase) - standardni, pristupačan pattern: showModal()/close() umjesto
 * ručnog upravljanja fokusom/ESC-om/klikom na pozadinu.
 */
export function AddMovieModal({
  open,
  onClose,
  idInput,
  onIdInputChange,
  titleInput,
  onTitleInputChange,
  genresInput,
  onGenresInputChange,
  formError,
  onSubmit,
  onAddAnother,
  loading,
  networkError,
  status,
  ok,
  body,
}: AddMovieModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sinhronizuje "open" prop (React state u App.tsx) sa imperativnim
  // showModal()/close() API-jem <dialog> elementa - <dialog> nema
  // deklarativni "open" prop koji bi napravio pravi modal (sa backdrop-om,
  // fokus zamkom i ESC podrškom), pa se to mora pozvati eksplicitno.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Uspješno dodat film (201) - isti JSON oblik kao GET /movies/:dbEngine/:id
  // odgovor (vidi movie.controller.js -> addMovie), pa se ovdje ponovo
  // koristi POSTOJEĆI MovieQueryResult prikaz (kartica filma + metrike)
  // umjesto dupliranja markup-a.
  const isSuccess = ok === true && status === 201 && isMovieQuerySuccess(body);

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
          <PlusIcon className="h-5 w-5 text-primary" />
          Dodaj novi film
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Jednostavan POST upit - kreira novi zapis filma u odabranoj bazi (vidi toggle u
          sidebaru).
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="alert alert-success">
              <span>
                Film "{body.data.title}" (movieId: {body.data.movieId}) je uspješno dodat.
              </span>
            </div>

            <MovieQueryResult body={body} />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onAddAnother}>
                <PlusIcon className="h-4 w-4" />
                Dodaj još jedan film
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
            <form id="add-movie-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  ID filma
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="npr. 200001"
                  className="input input-bordered w-full"
                  value={idInput}
                  onChange={(event) => onIdInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Naslov
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

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Žanrovi <span className="normal-case font-normal">(opcionalno)</span>
                </span>
                <input
                  type="text"
                  placeholder="Comedy|Drama"
                  className="input input-bordered w-full"
                  value={genresInput}
                  onChange={(event) => onGenresInputChange(event.target.value)}
                  disabled={loading}
                />
                <span className="text-xs text-base-content/50">
                  Više žanrova odvojiti sa "|", npr. Comedy|Drama|Romance.
                </span>
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
                form="add-movie-form"
                className="btn btn-primary btn-sm"
                disabled={loading}
              >
                {loading && <span className="loading loading-spinner loading-xs" />}
                Dodaj film
              </button>
            </div>
          </>
        )}
      </div>

      {/* Klik na pozadinu zatvara modal - standardni daisyUI pattern (forma sa method="dialog"). */}
      <form method="dialog" className="modal-backdrop">
        <button>zatvori</button>
      </form>
    </dialog>
  );
}
