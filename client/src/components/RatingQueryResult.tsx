/**
 * Prikazuje odgovor POST /api/movies/:dbEngine/ratings rute (SLOŽEN POST -
 * dodaj ocjenu SAMO ako korisnik i film već postoje) u čitljivom obliku,
 * analogno MovieQueryResult.tsx za jednostavan GET/POST.
 *
 * Oblik uspješnog odgovora (vidi movie.controller.js -> addRating):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     data: { userId, movieId, rating, timestamp }
 *   }
 * (timestamp je Unix vrijeme u SEKUNDAMA - ista konvencija kao izvorni
 * MovieLens ratings.csv, vidi movie.service.js -> ravenAddRating/orientAddRating.)
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";
import { StarRatingDisplay } from "./StarRating";

interface Rating {
  userId: number;
  movieId: number;
  rating: number;
  timestamp: number;
}

interface RatingMutationSuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  data: Rating;
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora "dodaj ocjenu" upita. */
export function isRatingMutationSuccess(body: unknown): body is RatingMutationSuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return false;
  const data = b.data as Record<string, unknown>;
  return (
    typeof data.userId === "number" &&
    typeof data.movieId === "number" &&
    typeof data.rating === "number"
  );
}

export function RatingQueryResult({ body }: { body: RatingMutationSuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const ratedAt = new Date(data.timestamp * 1000).toLocaleString("bs-BA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Kartica ocjene */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="card-title text-xl">Ocjena dodata</h2>
              <p className="text-sm text-base-content/60 font-mono mt-1">
                userId: {data.userId} · movieId: {data.movieId}
              </p>
            </div>
            <EngineBadge engine={engine} />
          </div>

          <StarRatingDisplay value={data.rating} />

          <p className="text-xs text-base-content/50">Vrijeme ocjene: {ratedAt}</p>
        </div>
      </div>

      <MetricsTable
        tookMs={tookMs}
        cpuUserMs={cpuUserMs}
        cpuSystemMs={cpuSystemMs}
        rssDeltaBytes={rssDeltaBytes}
        heapUsedDeltaBytes={heapUsedDeltaBytes}
      />

      {/* Sirov JSON - dostupan po potrebi, ali sklonjen s glavnog prikaza */}
      <details className="collapse collapse-arrow bg-base-200 border border-base-300">
        <summary className="collapse-title text-sm font-medium">Sirovi JSON odgovor</summary>
        <div className="collapse-content">
          <pre className="rounded-box bg-neutral text-neutral-content text-xs p-4 overflow-auto">
            <code>{JSON.stringify(body, null, 2)}</code>
          </pre>
        </div>
      </details>
    </div>
  );
}
