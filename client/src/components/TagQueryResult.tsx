/**
 * Prikazuje odgovor DELETE /api/movies/:dbEngine/tags rute (JEDNOSTAVAN
 * DELETE - obriši jedan tag zapis) u čitljivom obliku, analogno
 * RatingQueryResult.tsx za složen POST (dodaj ocjenu).
 *
 * Oblik uspješnog odgovora (vidi movie.controller.js -> deleteTag):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     message: "Tag zapis uspješno obrisan.",
 *     data: { userId, movieId, tag, timestamp }
 *   }
 * (timestamp je Unix vrijeme u SEKUNDAMA - ista konvencija kao kod Ratings,
 * vidi movie.service.js -> ravenDeleteTag/orientDeleteTag; "data" je OBRISANI
 * zapis, vraćen serveru NA UVID nakon brisanja - ne postoji više u bazi.)
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";
import { TagIcon } from "./icons";

interface DeletedTag {
  userId: number;
  movieId: number;
  tag: string;
  timestamp: number;
}

interface TagMutationSuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  data: DeletedTag;
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora "obriši tag" upita. */
export function isTagMutationSuccess(body: unknown): body is TagMutationSuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return false;
  const data = b.data as Record<string, unknown>;
  return (
    typeof data.userId === "number" &&
    typeof data.movieId === "number" &&
    typeof data.tag === "string"
  );
}

export function TagQueryResult({ body }: { body: TagMutationSuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const taggedAt = new Date(data.timestamp * 1000).toLocaleString("bs-BA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Kartica obrisanog tag zapisa - "error" akcenat (umjesto uobičajenog
          "base-200"/neutralnog) da vizuelno naglasi da je ovo REZULTAT
          brisanja (zapis više ne postoji u bazi), a ne novi/izmijenjeni podatak. */}
      <div className="card bg-error/5 border border-error/30">
        <div className="card-body gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="card-title text-xl">
                <TagIcon className="h-5 w-5 text-error" />
                Tag obrisan
              </h2>
              <p className="text-sm text-base-content/60 font-mono mt-1">
                userId: {data.userId} · movieId: {data.movieId}
              </p>
            </div>
            <EngineBadge engine={engine} />
          </div>

          <span className="badge badge-error badge-soft self-start line-through decoration-2">
            {data.tag}
          </span>

          <p className="text-xs text-base-content/50">Originalno označeno: {taggedAt}</p>
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
