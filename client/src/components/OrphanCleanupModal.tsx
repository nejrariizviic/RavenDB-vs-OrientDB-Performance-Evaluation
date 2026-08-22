import { useEffect, useRef, type FormEvent } from "react";
import { isOrphanCleanupSuccess, OrphanCleanupResult } from "./OrphanCleanupResult";
import { ArrowRightIcon, BroomIcon } from "./icons";

interface OrphanCleanupModalProps {
  open: boolean;
  onClose: () => void;

  /** Prazan string = koristi BE podrazumijevanu vrijednost (10, ujedno i tvrda gornja granica - vidi movie.controller.js). */
  limitInput: string;
  onLimitInputChange: (value: string) => void;
  formError: string | null;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** "Pokreni ponovo" - resetuje rezultat, ali OSTAVLJA modal otvoren (isti duh kao onRunAnother u CorrectRatingsModal.tsx). */
  onRunAnother: () => void;

  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;
}

/** Izvlači poruku o grešci iz JSON tijela BE odgovora (vidi movie.controller.js -> deleteOrphanMovieRatings: samo 400 - loš 'limit' query parametar, nema 404/409 jer ovo NIJE upit nad jednim resursom). */
function extractErrorMessage(body: unknown, status: number | null): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Zahtjev nije uspio (HTTP ${status ?? "?"}).`;
}

/**
 * Popup (modal) za SLOŽEN DELETE upit - "orphan cleanup": briše ocjene
 * filmova koji nemaju nijedan tag. Strukturno kombinuje dva ranija pattern-a:
 *
 * 1. Isti "masovna operacija" tretman kao CorrectRatingsModal.tsx (info-
 *    dijagram koji objašnjava TAČNO šta upit radi PRIJE slanja, agregatni
 *    rezultat umjesto kartice jednog resursa, "Pokreni ponovo" umjesto
 *    "Zatvori" da se upit može ponoviti dok deletedCount ne padne na 0).
 * 2. Isti "destruktivna radnja" vizuelni tretman kao DeleteTagModal.tsx
 *    (crvena "error" akcentna boja, upozorenje prije submit dugmeta,
 *    BroomIcon umjesto ikonice koja asocira na kreiranje/izmjenu).
 *
 * Za razliku od oba, ovdje NEMA identifikacionih polja (userId/movieId/tag
 * ili delta/minRatings) - jedino opciono polje je "limit" (koliko ocjena
 * najviše obrisati PO POZIVU), a on ide kroz QUERY STRING, ne kroz body (vidi
 * movie.routes.js: DELETE /api/movies/:dbEngine/ratings/orphan-cleanup?limit=).
 */
export function OrphanCleanupModal({
  open,
  onClose,
  limitInput,
  onLimitInputChange,
  formError,
  onSubmit,
  onRunAnother,
  loading,
  networkError,
  status,
  ok,
  body,
}: OrphanCleanupModalProps) {
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

  // Uspješan "orphan cleanup" - UVIJEK HTTP 200 (i kad nema orphan ocjena,
  // vidi OrphanCleanupResult.tsx - "no_orphans" nije greška).
  const isSuccess = ok === true && status === 200 && isOrphanCleanupSuccess(body);

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
          <BroomIcon className="h-5 w-5 text-error" />
          Orphan cleanup
        </h3>
        <p className="text-sm text-base-content/60 mt-1 mb-4">
          Složen DELETE upit - briše ocjene (Ratings) filmova koji NEMAJU nijedan tag, iz odabrane
          baze (vidi toggle u sidebaru). Masovna, nepovratna operacija, ograničena na najviše 10
          obrisanih ocjena po pozivu - pozovi više puta dok se ne obrišu sve.
        </p>

        {isSuccess ? (
          <div className="flex flex-col gap-4">
            <OrphanCleanupResult body={body} />

            <div className="modal-action mt-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRunAnother}>
                <BroomIcon className="h-4 w-4" />
                Pokreni ponovo
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
            {/* Info-dijagram: objašnjava TAČNO šta upit radi PRIJE nego korisnik pošalje - isti duh kao CorrectRatingsModal.tsx. */}
            <div className="rounded-box border border-base-300 bg-base-200/60 p-3 mb-4 flex items-center justify-center gap-2 flex-wrap text-xs font-mono">
              <span className="badge badge-ghost">film bez taga</span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-base-content/40 shrink-0" />
              <span className="badge badge-ghost">njegove ocjene</span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-base-content/40 shrink-0" />
              <span className="badge badge-error badge-outline">obrisano (max 10)</span>
            </div>

            <form id="orphan-cleanup-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                  Limit po pozivu <span className="normal-case font-normal">(opciono, max 10)</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  placeholder="prazno = 10"
                  className="input input-bordered w-full"
                  value={limitInput}
                  onChange={(event) => onLimitInputChange(event.target.value)}
                  disabled={loading}
                />
                <span className="text-xs text-base-content/50">
                  BE prihvata veći broj, ali ga svejedno ograničava na tvrdu gornju granicu od 10 po
                  pozivu.
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

            <div role="alert" className="alert alert-warning mt-4 text-sm py-2">
              <span>Ovo trajno briše zapise iz baze - nema potvrde niti opoziva nakon slanja.</span>
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
                form="orphan-cleanup-form"
                className="btn btn-error btn-sm"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <BroomIcon className="h-4 w-4" />
                )}
                Pokreni čišćenje
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
