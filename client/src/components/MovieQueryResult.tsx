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
  if (!b.data || typeof b.data !== "object") return false;
  const data = b.data as Record<string, unknown>;
  return typeof data.movieId === "number" && typeof data.title === "string";
}

/** Formatira bajte (delta - može biti negativna) u čitljiv oblik (B/KB/MB). */
function formatBytesDelta(bytes: number): string {
  const sign = bytes > 0 ? "+" : bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  const kb = abs / 1024;
  if (kb < 1024) return `${sign}${kb.toFixed(1)} KB`;
  return `${sign}${(kb / 1024).toFixed(2)} MB`;
}

function formatMs(value: number): string {
  return `${value.toFixed(3)} ms`;
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

function EngineBadge({ engine }: { engine: string }) {
  const isRaven = engine === "ravendb";
  return (
    <span className={`badge ${isRaven ? "badge-info" : "badge-warning"} badge-outline`}>
      {isRaven ? "RavenDB" : engine === "orientdb" ? "OrientDB" : engine}
    </span>
  );
}

export function MovieQueryResult({ body }: { body: MovieQuerySuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const genres = normalizeGenres(data.genres);

  const metrics: Array<{ label: string; value: string; hint: string }> = [
    { label: "Trajanje upita", value: formatMs(tookMs), hint: "process.hrtime, samo poziv bazi" },
    { label: "CPU (user)", value: formatMs(cpuUserMs), hint: "CPU vrijeme u user modu" },
    { label: "CPU (system)", value: formatMs(cpuSystemMs), hint: "CPU vrijeme u kernel modu" },
    { label: "RSS memorija", value: formatBytesDelta(rssDeltaBytes), hint: "delta rezidentne memorije procesa" },
    { label: "Heap memorija", value: formatBytesDelta(heapUsedDeltaBytes), hint: "delta zauzetog V8 heap-a" },
  ];

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

      {/* Tabela metrika */}
      <div>
        <h3 className="text-sm font-semibold text-base-content/70 mb-2">Metrike upita</h3>
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table">
            <thead>
              <tr>
                <th>Metrika</th>
                <th>Vrijednost</th>
                <th className="hidden sm:table-cell">Opis</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label}>
                  <td className="font-medium">{m.label}</td>
                  <td className="font-mono">{m.value}</td>
                  <td className="hidden sm:table-cell text-sm text-base-content/60">{m.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
