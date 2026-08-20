import { useEffect, useRef, type FormEvent } from "react";
import { CorrectRatingsResult, isCorrectRatingsSuccess } from "./CorrectRatingsResult";
import { ArrowRightIcon, WrenchIcon } from "./icons";

interface CorrectRatingsModalProps {
  open: boolean;
  onClose: () => void;

  deltaInput: string;
  onDeltaInputChange: (value: string) => void;
  minRatingsInput: string;
  onMinRatingsInputChange: (value: string) => void;
  /** Prazan string = bez ograničenja (šalje se na SVE aktivne korisnike) - vidi napomenu u App.tsx/movie.controller.js o "dev test" namjeni ovog polja. */
  maxActiveUsersInput: string;
  onMaxActiveUsersInputChange: (value: string) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Nova korekcija" - resetuje rezultat, ali OSTAVLJA modal otvoren (isti duh kao onAddAnother/onEditAnother u ostalim modalima). */
  onRunAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;

  /** Potvrđene vrijednosti POSLJEDNJEG poslatog zahtjeva - odgovor sa BE-a ne nosi delta/minRatings nazad (vidi CorrectRatingsResult.tsx). */
  lastAppliedDelta: number;
  lastAppliedMinRatings: number;
}

/** Izvlači poruku o grešci iz JSON tijela BE odgovora (vidi movie.controller.js -> correctActiveUsersRatings: samo 400 - loša validacija, nema 404/409 jer ovo NIJE upit nad jednim resursom). */
function extractErrorMessage(body: unknown, status: number | null): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Zahtjev nije uspio (HTTP ${status ?? "?"}).`;
}

/**
 * Popup (modal) za SLOŽEN PUT upit - masovna korekcija ocjena "aktivnih"
 * korisnika. Strukturno isti pattern kao AddRatingModal.tsx/EditMovieModal.tsx
 * (nativni <dialog>, isti tok uspjeh/greška), ali sa dvije razlike
 * specifičnim za ovaj upit:
 *
 * 1. Ovo je MASOVNA operacija (može pogoditi mnogo zapisa odjednom) - zato
 *    forma ima kratak info-dijagram koji objašnjava TAČNO šta se mijenja
 *    (samo ocjene < 3, rezultat ograničen na 0.5-5.0) i opciono polje
 *    "maxActiveUsers" za bezbjedno isprobavanje na manjem uzorku prije
 *    punog pokretanja (vidi movie.controller.js za isto obrazloženje).
 * 2. Odgovor ne nosi nazad delta/minRatings (samo agregatne brojeve), pa se
 *    ovdje prosljeđuju kao zasebni props (lastAppliedDelta/lastAppliedMinRatings)
 *    iz App.tsx - vidi napomenu u CorrectRatingsResult.tsx.
 */
export function CorrectRatingsModal({
  open,
  onClose,
  deltaInput,
  onDeltaInputChange,
  minRatingsInput,
  onMinRatingsInputChange,
  maxActiveUsersInput,
  onMaxActiveUsersInputChange,
  formError,
  onSubmit,
  onRunAnother,
  loading,
  networkError,
  status,
  ok,
  body,
  lastAppliedDelta,
  lastAppliedMinRatings,
}: CorrectRatingsModalProps) {
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

  // Uspješna korekcija - UVIJEK HTTP 200 (i kad nema aktivnih korisnika, vidi
  // CorrectRatingsResult.tsx - "no_active_users" nije greška).
  const isSuccess = ok === true && status === 200 && isCorrectRatingsSuccess(body);

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
          <WrenchIcon className="h-5 w-5 text-warning" />
          Korekcija ocjena aktivnih korisnika
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Složen PUT upit - korigira ocjene SVIH korisnika koji imaju više od zadatog broja
          ocjena (vidi toggle u sidebaru za bazu). Masovna izmjena, ne jedan resurs.
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <CorrectRatingsResult
              body={body}
              appliedDelta={lastAppliedDelta}
              appliedMinRatings={lastAppliedMinRatings}
            />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRunAnother}>
                <WrenchIcon className="h-4 w-4" />
                Nova korekcija
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
            {/* Info-dijagram: objašnjava TAČNO šta upit radi PRIJE nego korisnik pošalje - vidi dokblok iznad. */}
            <div className="rounded-box border border-base-300 bg-base-200/60 p-3 mb-4 flex items-center justify-center gap-2 flex-wrap text-xs font-mono">
              <span className="badge badge-error badge-outline">ocjena &lt; 3</span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-base-content/40 shrink-0" />
              <span className="badge badge-ghost">+ delta</span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-base-content/40 shrink-0" />
              <span className="badge badge-success badge-outline">clamp 0.5 - 5.0</span>
            </div>

            <form
              id="correct-ratings-form"
              onSubmit={onSubmit}
              className="flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Delta <span className="normal-case font-normal">(dodaje se svakoj ocjeni, npr. 0.5 ili -0.5)</span>
                </span>
                <input
                  type="number"
                  step={0.1}
                  placeholder="npr. 0.5"
                  className="input input-bordered w-full"
                  value={deltaInput}
                  onChange={(event) => onDeltaInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Prag "aktivnog" korisnika (min. broj ocjena)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="npr. 100"
                  className="input input-bordered w-full"
                  value={minRatingsInput}
                  onChange={(event) => onMinRatingsInputChange(event.target.value)}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Maks. broj korisnika{" "}
                  <span className="normal-case font-normal">(opciono, dev test)</span>
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="prazno = bez ograničenja"
                  className="input input-bordered w-full"
                  value={maxActiveUsersInput}
                  onChange={(event) => onMaxActiveUsersInputChange(event.target.value)}
                  disabled={loading}
                />
                <span className="text-xs text-base-content/50">
                  Ostavi prazno za pun benchmark (svi aktivni korisnici); ograniči ovim poljem
                  za brzo, bezbjedno isprobavanje na manjem uzorku.
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
                form="correct-ratings-form"
                className="btn btn-warning btn-sm"
                disabled={loading}
              >
                {loading && <span className="loading loading-spinner loading-xs" />}
                Primijeni korekciju
              </button>
            </div>
          </>
        )}
      </div>

      {/* Klik na pozadinu zatvara modal - isti daisyUI pattern kao ostali modali. */}
      <form method="dialog" className="modal-backdrop">
        <button>zatvori</button>
      </form>
    </dialog>
  );
}
