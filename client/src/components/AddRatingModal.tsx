import { useEffect, useRef, type FormEvent } from "react";
import { isRatingMutationSuccess, RatingQueryResult } from "./RatingQueryResult";
import { StarRatingInput } from "./StarRating";
import { StarIcon } from "./icons";

interface AddRatingModalProps {
  open: boolean;
  onClose: () => void;

  userIdInput: string;
  onUserIdInputChange: (value: string) => void;
  movieIdInput: string;
  onMovieIdInputChange: (value: string) => void;
  rating: number;
  onRatingChange: (value: number) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Dodaj još jednu ocjenu" - resetuje rezultat, ali OSTAVLJA modal otvoren. */
  onAddAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;
}

/**
 * Izvlači poruku o grešci iz JSON tijela BE odgovora (vidi
 * movie.controller.js -> addRating: 400 - loša validacija, 404 - korisnik
 * i/ili film ne postoje, 409 - ocjena je već upisana za taj par).
 */
function extractErrorMessage(body: unknown, status: number | null): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Zahtjev nije uspio (HTTP ${status ?? "?"}).`;
}

/**
 * Popup (modal) za SLOŽEN POST upit - dodavanje ocjene. Strukturno isti
 * pattern kao AddMovieModal.tsx (nativni <dialog>, isti tok uspjeh/greška),
 * ali sa jasno drugačijom semantikom: BE ovdje PRVO provjerava da korisnik
 * (userId) i film (movieId) već postoje (404 ako bilo koji od njih ne
 * postoji) i da par korisnik+film već nema ocjenu (409 na duplikat), tek
 * onda upisuje ocjenu - vidi movie.controller.js -> addRating i
 * movie.service.js -> ravenAddRating/orientAddRating.
 */
export function AddRatingModal({
  open,
  onClose,
  userIdInput,
  onUserIdInputChange,
  movieIdInput,
  onMovieIdInputChange,
  rating,
  onRatingChange,
  formError,
  onSubmit,
  onAddAnother,
  loading,
  networkError,
  status,
  ok,
  body,
}: AddRatingModalProps) {
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

  // Uspješno dodata ocjena (201) - vidi RatingQueryResult.tsx za oblik odgovora.
  const isSuccess = ok === true && status === 201 && isRatingMutationSuccess(body);

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
          <StarIcon className="h-5 w-5 text-warning" />
          Dodaj ocjenu
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Složen POST upit - ocjena se upisuje SAMO ako korisnik i film već postoje u odabranoj
          bazi (vidi toggle u sidebaru), a duplikat (isti korisnik + isti film) se odbija.
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="alert alert-success">
              <span>
                Ocjena {body.data.rating.toFixed(1)}/5 za film (movieId: {body.data.movieId}) od
                korisnika (userId: {body.data.userId}) je uspješno dodata.
              </span>
            </div>

            <RatingQueryResult body={body} />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onAddAnother}>
                <StarIcon className="h-4 w-4" />
                Dodaj još jednu ocjenu
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
            <form id="add-rating-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  ID korisnika (userId)
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="npr. 1"
                  className="input input-bordered w-full"
                  value={userIdInput}
                  onChange={(event) => onUserIdInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  ID filma (movieId)
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="npr. 2"
                  className="input input-bordered w-full"
                  value={movieIdInput}
                  onChange={(event) => onMovieIdInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Ocjena <span className="normal-case font-normal">(0.5 - 5)</span>
                </span>
                <StarRatingInput value={rating} onChange={onRatingChange} disabled={loading} />
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
                form="add-rating-form"
                className="btn btn-primary btn-sm"
                disabled={loading}
              >
                {loading && <span className="loading loading-spinner loading-xs" />}
                Dodaj ocjenu
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
