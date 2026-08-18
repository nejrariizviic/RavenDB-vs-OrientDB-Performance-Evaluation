import type { FormEvent } from "react";
import { isMovieQuerySuccess, MovieQueryResult } from "./MovieQueryResult";

interface ResponsePanelProps {
  method: string;
  url: string;
  loading: boolean;
  /** Greška na nivou mreže/transporta - server nije dostupan i sl. */
  networkError: string | null;
  status: number | null;
  ok: boolean | null;
  body: unknown;
  movieIdInput: string;
  onMovieIdInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  movieIdError: string | null;
}

function formatBody(body: unknown): string {
  if (body === null || body === undefined) {
    return "Odgovor nema JSON tijelo.";
  }
  return JSON.stringify(body, null, 2);
}

export function ResponsePanel({
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
}: ResponsePanelProps) {
  return (
    <main className="flex-1 p-8 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3 font-mono text-sm">
          <span className="badge badge-primary badge-outline">{method}</span>
          <span className="text-base-content/80 break-all">{url}</span>
        </div>

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
      </div>

      {movieIdError && <p className="text-error text-xs mb-4">{movieIdError}</p>}

      {status !== null && (
        <div className={`badge mb-4 ${ok ? "badge-success" : "badge-error"}`}>
          HTTP {status}
        </div>
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
      ) : (
        <pre className="rounded-box bg-neutral text-neutral-content text-sm p-4 overflow-auto">
          <code>{formatBody(body)}</code>
        </pre>
      )}
    </main>
  );
}
