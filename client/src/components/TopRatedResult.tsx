/**
 * Prikazuje odgovor GET /api/movies/:dbEngine/top-rated rute u čitljivom
 * obliku (rang-lista filmova + tabela benchmark metrika) umjesto sirovog
 * JSON-a - analogno MovieQueryResult.tsx, samo za "složeni" GET upit
 * (Top N filmova po prosječnoj ocjeni, uz minimalan broj ocjena).
 *
 * Oblik uspješnog odgovora (vidi movie.controller.js -> getTopRatedMovies):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     count: number,
 *     data: [{ movieId, title, genres, avgRating, ratingCount }, ...]
 *   }
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";

interface TopRatedMovie {
  movieId: number;
  title: string | null;
  genres?: string | string[] | null;
  avgRating: number;
  ratingCount: number;
}

interface TopRatedQuerySuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  count: number;
  data: TopRatedMovie[];
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora "top-rated" upita. */
export function isTopRatedQuerySuccess(body: unknown): body is TopRatedQuerySuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!Array.isArray(b.data)) return false;
  if (b.data.length === 0) return true;
  const first = b.data[0] as Record<string, unknown>;
  return typeof first.movieId === "number" && typeof first.avgRating === "number";
}

/** Normalizuje genres polje u niz čitljivih naziva (isti oblik kao u MovieQueryResult). */
function normalizeGenres(genres: TopRatedMovie["genres"]): string[] {
  if (!genres) return [];
  const raw = Array.isArray(genres) ? genres : String(genres).split("|");
  return raw
    .map((g) => String(g).trim())
    .filter((g) => g.length > 0 && g !== "(no genres listed)");
}

export function TopRatedResult({ body }: { body: TopRatedQuerySuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">
          Top {data.length} filmova po prosječnoj ocjeni
        </h2>
        <EngineBadge engine={engine} />
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-base-content/50 italic">
          Nema filmova koji zadovoljavaju traženi minimalan broj ocjena.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Naslov</th>
                <th className="hidden md:table-cell">Žanrovi</th>
                <th>Prosječna ocjena</th>
                <th>Broj ocjena</th>
              </tr>
            </thead>
            <tbody>
              {data.map((movie, index) => {
                const genres = normalizeGenres(movie.genres);
                return (
                  <tr key={movie.movieId}>
                    <td className="font-mono text-base-content/60">{index + 1}</td>
                    <td>
                      <div className="font-medium">{movie.title ?? "(nepoznat naslov)"}</div>
                      <div className="text-xs text-base-content/50 font-mono">
                        movieId: {movie.movieId}
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      {genres.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {genres.map((genre) => (
                            <span key={genre} className="badge badge-primary badge-soft badge-sm">
                              {genre}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-base-content/40 italic text-sm">-</span>
                      )}
                    </td>
                    <td className="font-mono font-semibold">{movie.avgRating.toFixed(2)}</td>
                    <td className="font-mono">{movie.ratingCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
