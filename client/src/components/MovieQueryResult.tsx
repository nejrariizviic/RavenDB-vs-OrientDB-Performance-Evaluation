/**
 * Prikazuje odgovor GET /api/movies/:dbEngine/:id rute u čitljivom obliku
 * (kartica filma + tabela benchmark metrika) umjesto sirovog JSON-a.
 *
 * Oblik uspješnog odgovora (vidi movie.controller.js -> getMovieById):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     data: { movieId, title, genres }
 *   }
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";

interface Movie {
  movieId: number;
  title: string;
  // Backend tipizira genres kao "*" (vidi movie.service.js) - u praksi je to
  // pipe-string kod RavenDB-a ("Comedy|Drama"), ali kod OrientDB-a stiže kao
  // niz stringova, pa se ovdje tretiraju oba oblika (i null/undefined).
  genres?: string | string[] | null;
}

interface MovieQuerySuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  data: Movie;
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora. */
export function isMovieQuerySuccess(body: unknown): body is MovieQuerySuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return false;
  const data = b.data as Record<string, unknown>;
  return typeof data.movieId === "number" && typeof data.title === "string";
}

/**
 * Normalizuje genres polje u niz čitljivih naziva, bez obzira da li backend
 * vrati pipe-string ("Comedy|Drama", RavenDB) ili niz ("Comedy", "Drama",
 * OrientDB) - vidi napomenu uz Movie interfejs.
 */
function normalizeGenres(genres: Movie["genres"]): string[] {
  if (!genres) return [];

  const raw = Array.isArray(genres) ? genres : String(genres).split("|");

  return raw
    .map((g) => String(g).trim())
    .filter((g) => g.length > 0 && g !== "(no genres listed)");
}

export function MovieQueryResult({ body }: { body: MovieQuerySuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const genres = normalizeGenres(data.genres);

  return (
    <div className="flex flex-col gap-6">
      {/* Kartica filma */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="card-title text-xl">{data.title}</h2>
              <p className="text-sm text-base-content/60 font-mono mt-1">movieId: {data.movieId}</p>
            </div>
            <EngineBadge engine={engine} />
          </div>

          {genres.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {genres.map((genre) => (
                <span key={genre} className="badge badge-primary badge-soft">
                  {genre}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-content/50 italic">Nema navedenih žanrova.</p>
          )}
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
