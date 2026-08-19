import type { FormEvent } from "react";
import { isMovieQuerySuccess, MovieQueryResult } from "./MovieQueryResult";
import { isTopRatedQuerySuccess, TopRatedResult } from "./TopRatedResult";
import { isRatingMutationSuccess, RatingQueryResult } from "./RatingQueryResult";
import { RequestTypeSelector } from "./RequestTypeSelector";
import { PencilIcon, PlusIcon, StarIcon } from "./icons";
import type { RequestKind } from "../lib/requestKind";

interface ResponsePanelProps {
  requestKind: RequestKind;
  onRequestKindChange: (value: RequestKind) => void;

  method: string;
  url: string;
  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;

  // Forma za JEDNOSTAVAN GET (film po ID-u)
  movieIdInput: string;
  onMovieIdInputChange: (value: string) => void;
  movieIdError: string | null;

  // Forma za SLOŽEN GET (Top N filmova po ocjeni, uz minimalan broj ocjena)
  limitInput: string;
  onLimitInputChange: (value: string) => void;
  minRatingsInput: string;
  onMinRatingsInputChange: (value: string) => void;
  topRatedError: string | null;

  /** Zajednički submit handler za GET forme (by-id/top-rated) - App.tsx zna koju formu (i validaciju) da primijeni na osnovu trenutnog requestKind-a. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;

  /** Otvara popup za JEDNOSTAVAN POST (dodaj novi film) - vidi AddMovieModal.tsx. */
  onOpenAddMovieModal: () => void;
  /** Otvara popup za SLOŽEN POST (dodaj ocjenu) - vidi AddRatingModal.tsx. */
  onOpenAddRatingModal: () => void;
  /** Otvara popup za JEDNOSTAVAN PUT (izmijeni naslov filma) - vidi EditMovieModal.tsx. */
  onOpenEditMovieModal: () => void;
}

function formatBody(body: unknown): string {
  if (body === null || body === undefined) {
    return "Odgovor nema JSON tijelo.";
  }
  return JSON.stringify(body, null, 2);
}

export function ResponsePanel({
  requestKind,
  onRequestKindChange,
  method,
  url,
  loading,
  networkError,
  status,
  ok,
  body,
  movieIdInput,
  onMovieIdInputChange,
  onSubmit,
  movieIdError,
  limitInput,
  onLimitInputChange,
  minRatingsInput,
  onMinRatingsInputChange,
  topRatedError,
  onOpenAddMovieModal,
  onOpenAddRatingModal,
  onOpenEditMovieModal,
}: ResponsePanelProps) {
  // Za mutacije (add-movie/add-rating/edit-title) nema forme u ovom panelu
  // (samo dugme koje otvara popup) - "prazno stanje" (još nema poslatog
  // zahtjeva) se prikazuje umjesto sirovog "nema JSON tijela" placeholder-a.
  const isMutationKind =
    requestKind === "add-movie" || requestKind === "add-rating" || requestKind === "edit-title";
  const showEmptyMutationState = isMutationKind && status === null && !networkError && !loading;

  return (
    <main className="flex-1 p-8 overflow-auto">
      <RequestTypeSelector value={requestKind} onChange={onRequestKindChange} disabled={loading} />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3 font-mono text-sm">
          <span
            className={`badge badge-outline ${method === "GET" ? "badge-primary" : "badge-secondary"}`}
          >
            {method}
          </span>
          <span className="text-base-content/80 break-all">{url}</span>
        </div>

        {requestKind === "by-id" && (
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <label htmlFor="movie-id-input" className="text-sm text-base-content/60 whitespace-nowrap">
              ID filma
            </label>
            <input
              id="movie-id-input"
              type="number"
              min={1}
              step={1}
              className="input input-sm input-bordered w-24"
              value={movieIdInput}
              onChange={(event) => onMovieIdInputChange(event.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={loading}>
              {loading && <span className="loading loading-spinner loading-xs" />}
              Pošalji zahtjev
            </button>
          </form>
        )}

        {requestKind === "top-rated" && (
          <form onSubmit={onSubmit} className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="top-rated-limit-input"
              className="text-sm text-base-content/60 whitespace-nowrap"
            >
              Top N
            </label>
            <input
              id="top-rated-limit-input"
              type="number"
              min={1}
              max={100}
              step={1}
              className="input input-sm input-bordered w-20"
              value={limitInput}
              onChange={(event) => onLimitInputChange(event.target.value)}
            />
            <label
              htmlFor="top-rated-min-ratings-input"
              className="text-sm text-base-content/60 whitespace-nowrap"
            >
              Min. ocjena
            </label>
            <input
              id="top-rated-min-ratings-input"
              type="number"
              min={0}
              step={1}
              className="input input-sm input-bordered w-24"
              value={minRatingsInput}
              onChange={(event) => onMinRatingsInputChange(event.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={loading}>
              {loading && <span className="loading loading-spinner loading-xs" />}
              Pošalji zahtjev
            </button>
          </form>
        )}

        {requestKind === "add-movie" && (
          <button
            type="button"
            className="btn btn-sm btn-secondary gap-1.5"
            onClick={onOpenAddMovieModal}
          >
            <PlusIcon className="h-4 w-4" />
            Otvori formu za dodavanje filma
          </button>
        )}

        {requestKind === "add-rating" && (
          <button
            type="button"
            className="btn btn-sm btn-secondary gap-1.5"
            onClick={onOpenAddRatingModal}
          >
            <StarIcon className="h-4 w-4" />
            Otvori formu za dodavanje ocjene
          </button>
        )}

        {requestKind === "edit-title" && (
          <button
            type="button"
            className="btn btn-sm btn-warning gap-1.5"
            onClick={onOpenEditMovieModal}
          >
            <PencilIcon className="h-4 w-4" />
            Otvori formu za izmjenu naslova
          </button>
        )}
      </div>

      {requestKind === "by-id" && movieIdError && (
        <p className="text-error text-xs mb-4">{movieIdError}</p>
      )}
      {requestKind === "top-rated" && topRatedError && (
        <p className="text-error text-xs mb-4">{topRatedError}</p>
      )}

      {status !== null && (
        <div className={`badge mb-4 ${ok ? "badge-success" : "badge-error"}`}>HTTP {status}</div>
      )}

      {networkError && (
        <div role="alert" className="alert alert-error mb-4">
          <span>Zahtjev nije stigao do servera: {networkError}</span>
        </div>
      )}

      {loading ? (
        <pre className="rounded-box bg-neutral text-neutral-content text-sm p-4 overflow-auto">
          <code>Čekam odgovor servera...</code>
        </pre>
      ) : isMovieQuerySuccess(body) ? (
        <MovieQueryResult body={body} />
      ) : isTopRatedQuerySuccess(body) ? (
        <TopRatedResult body={body} />
      ) : isRatingMutationSuccess(body) ? (
        <RatingQueryResult body={body} />
      ) : showEmptyMutationState ? (
        <div className="rounded-box border border-dashed border-base-300 p-10 flex flex-col items-center gap-3 text-center text-base-content/60">
          {requestKind === "add-movie" ? (
            <PlusIcon className="h-8 w-8 opacity-40" />
          ) : requestKind === "add-rating" ? (
            <StarIcon className="h-8 w-8 opacity-40" />
          ) : (
            <PencilIcon className="h-8 w-8 opacity-40" />
          )}
          <p className="text-sm max-w-sm">
            {requestKind === "add-movie"
              ? "Još nema poslatog zahtjeva. Klikni na dugme iznad da dodaš novi film."
              : requestKind === "add-rating"
                ? "Još nema poslatog zahtjeva. Klikni na dugme iznad da dodaš novu ocjenu - korisnik i film moraju već postojati."
                : "Još nema poslatog zahtjeva. Klikni na dugme iznad da izmijeniš naslov postojećeg filma."}
          </p>
        </div>
      ) : (
        <pre className="rounded-box bg-neutral text-neutral-content text-sm p-4 overflow-auto">
          <code>{formatBody(body)}</code>
        </pre>
      )}
    </main>
  );
}
