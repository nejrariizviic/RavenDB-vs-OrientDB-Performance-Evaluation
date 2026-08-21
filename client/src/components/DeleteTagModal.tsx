import { useEffect, useRef, type FormEvent } from "react";
import { isTagMutationSuccess, TagQueryResult } from "./TagQueryResult";
import { TagIcon, TrashIcon } from "./icons";

interface DeleteTagModalProps {
  open: boolean;
  onClose: () => void;

  userIdInput: string;
  onUserIdInputChange: (value: string) => void;
  movieIdInput: string;
  onMovieIdInputChange: (value: string) => void;
  tagInput: string;
  onTagInputChange: (value: string) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Obriši još jedan tag" - resetuje rezultat, ali OSTAVLJA modal otvoren. */
  onDeleteAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;
}

/**
 * Izvlači poruku o grešci iz JSON tijela BE odgovora (vidi
 * movie.controller.js -> deleteTag: 400 - loša validacija, 404 - tag zapis
 * sa datom trojkom userId+movieId+tag ne postoji).
 */
function extractErrorMessage(body: unknown, status: number | null): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Zahtjev nije uspio (HTTP ${status ?? "?"}).`;
}

/**
 * Popup (modal) za JEDNOSTAVAN DELETE upit - brisanje jednog tag zapisa.
 * Strukturno isti pattern kao AddRatingModal.tsx (nativni <dialog>, isti tok
 * uspjeh/greška, sva tri polja idu kroz JSON body a ne kroz putanju - vidi
 * movie.routes.js: DELETE /api/movies/:dbEngine/tags), ali sa jasno
 * DRUGAČIJIM vizuelnim tretmanom jer je ovo NEPOVRATNA (destruktivna)
 * operacija: crvena ("error") akcentna boja umjesto primarne/sekundarne,
 * upozorenje prije submit dugmeta, i TrashIcon umjesto ikonice koja
 * asocira na kreiranje/izmjenu.
 *
 * Trojka (userId, movieId, tag) je prirodni složeni ključ jednog tag zapisa
 * u MovieLens šemi (isti korisnik može dati VIŠE različitih tagova istom
 * filmu, pa sam userId+movieId nije dovoljan da jednoznačno identifikuje
 * jedan zapis) - BE odbija zahtjev sa 404 ako ta tačna trojka ne postoji.
 */
export function DeleteTagModal({
  open,
  onClose,
  userIdInput,
  onUserIdInputChange,
  movieIdInput,
  onMovieIdInputChange,
  tagInput,
  onTagInputChange,
  formError,
  onSubmit,
  onDeleteAnother,
  loading,
  networkError,
  status,
  ok,
  body,
}: DeleteTagModalProps) {
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

  // Uspješno obrisan tag (200) - vidi TagQueryResult.tsx za oblik odgovora.
  const isSuccess = ok === true && status === 200 && isTagMutationSuccess(body);

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
          <TrashIcon className="h-5 w-5 text-error" />
          Obriši tag
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Jednostavan DELETE upit - briše TAČNO JEDAN tag zapis (userId + movieId + tag čine
          složeni ključ) iz odabrane baze (vidi toggle u sidebaru); ako zapis sa datom trojkom ne
          postoji, zahtjev se odbija (404). Ova radnja je nepovratna.
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="alert alert-success">
              <span>
                Tag "{body.data.tag}" (userId: {body.data.userId}, movieId: {body.data.movieId})
                je uspješno obrisan.
              </span>
            </div>

            <TagQueryResult body={body} />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDeleteAnother}>
                <TrashIcon className="h-4 w-4" />
                Obriši još jedan tag
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
            <form id="delete-tag-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  ID korisnika (userId)
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="npr. 2"
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
                  placeholder="npr. 60756"
                  className="input input-bordered w-full"
                  value={movieIdInput}
                  onChange={(event) => onMovieIdInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Tag
                </span>
                <div className="relative">
                  <TagIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input
                    type="text"
                    placeholder="npr. funny"
                    className="input input-bordered w-full pl-9"
                    value={tagInput}
                    onChange={(event) => onTagInputChange(event.target.value)}
                    disabled={loading}
                  />
                </div>
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

            <div role="alert" className="alert alert-warning mt-4 text-sm py-2">
              <span>Ovo trajno briše zapis iz baze - provjeri trojku prije slanja zahtjeva.</span>
            </div>

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
                form="delete-tag-form"
                className="btn btn-error btn-sm"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <TrashIcon className="h-4 w-4" />
                )}
                Obriši tag
              </button>
            </div>
          </>
        )}
      </div>

      {/* Klik na pozadinu zatvara modal - isti daisyUI pattern kao AddRatingModal.tsx. */}
      <form method="dialog" className="modal-backdrop">
        <button>zatvori</button>
      </form>
    </dialog>
  );
}
