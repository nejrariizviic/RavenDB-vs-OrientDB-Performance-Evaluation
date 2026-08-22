/**
 * Prikazuje odgovor DELETE /api/movies/:dbEngine/ratings/orphan-cleanup rute
 * (SLOŽEN DELETE - "orphan cleanup": obriši ocjene filmova bez ijednog taga)
 * u čitljivom obliku, analogno CorrectRatingsResult.tsx (SLOŽEN PUT) - i ovaj
 * odgovor nosi SKUP pogođenih zapisa umjesto jednog resursa (data.data nema
 * jedan userId/movieId - vidi movie.controller.js -> deleteOrphanMovieRatings),
 * pa je i ovdje prikaz oblikovan kao "statistika operacije".
 *
 * Oblik uspješnog odgovora (uvijek HTTP 200, i kad nema orphan ocjena -
 * "no_orphans" NIJE greška, samo znači da trenutno nema šta da se obriše):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     message: string,
 *     data: { deletedCount: number, limit: number }
 *   }
 *
 * Za razliku od CorrectRatingsResult.tsx (gdje delta/minRatings NISU dio
 * odgovora), ovdje se "limit" VRAĆA nazad u data.limit (vidi controller -
 * uvijek odražava STVARNO primijenjeni limit, tj. min(traženi limit, 10)) -
 * pa ovoj komponenti, za razliku od one, nije potreban poseban prop za
 * "poslednju potvrđenu vrijednost".
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";
import { BroomIcon, TrashIcon } from "./icons";

interface OrphanCleanupData {
  deletedCount: number;
  limit: number;
}

interface OrphanCleanupSuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  message: string;
  data: OrphanCleanupData;
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora "orphan cleanup" upita. */
export function isOrphanCleanupSuccess(body: unknown): body is OrphanCleanupSuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return false;
  const data = b.data as Record<string, unknown>;
  return typeof data.deletedCount === "number" && typeof data.limit === "number";
}

export function OrphanCleanupResult({ body }: { body: OrphanCleanupSuccess }) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const hasDeleted = data.deletedCount > 0;
  // Ako je obrisano MANJE nego traženi limit, nema više orphan ocjena u bazi
  // (isti zaključak koji korisnik može izvesti iz "no_orphans" poruke na BE -
  // vidi movie.controller.js) - koristan signal da dalje ponavljanje poziva
  // više nema smisla.
  const reachedEnd = data.deletedCount < data.limit;

  return (
    <div className="flex flex-col gap-6">
      {/* Kartica operacije - statistika umjesto kartice jednog resursa (vidi dokblok iznad), "error" akcenat jer je ovo destruktivna (DELETE) operacija. */}
      <div className={`card border ${hasDeleted ? "bg-error/5 border-error/30" : "bg-base-200 border-base-300"}`}>
        <div className="card-body gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className={`rounded-full p-2 ${hasDeleted ? "bg-error/15 text-error" : "bg-base-300 text-base-content/60"}`}>
                <BroomIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="card-title text-xl leading-tight">
                  {hasDeleted ? "Orphan ocjene obrisane" : "Nema orphan ocjena"}
                </h2>
                <p className="text-sm text-base-content/60 mt-0.5">{body.message}</p>
              </div>
            </div>
            <EngineBadge engine={engine} />
          </div>

          {/* Statistika operacije (daisyUI "stats") - isti "@container" pattern kao
              CorrectRatingsResult.tsx (renderuje se i u OrphanCleanupModal.tsx, max-w-lg, i
              u širokom glavnom panelu). */}
          <div className="@container">
            <div className="stats stats-vertical @lg:stats-horizontal shadow-sm border border-base-300 bg-base-100 w-full">
              <div className="stat">
                <div className={`stat-figure ${hasDeleted ? "text-error" : "text-base-content/40"}`}>
                  <TrashIcon className="h-6 w-6" />
                </div>
                <div className="stat-title">Obrisano ocjena</div>
                <div className={`stat-value text-2xl ${hasDeleted ? "text-error" : ""}`}>
                  {data.deletedCount}
                </div>
                <div className="stat-desc">filmovi bez ijednog taga</div>
              </div>

              <div className="stat">
                <div className="stat-figure text-secondary">
                  <BroomIcon className="h-6 w-6" />
                </div>
                <div className="stat-title">Limit po pozivu</div>
                <div className="stat-value text-secondary text-2xl">{data.limit}</div>
                <div className="stat-desc">tvrda gornja granica: 10</div>
              </div>
            </div>
          </div>

          {hasDeleted && (
            <p className="text-xs text-base-content/50">
              {reachedEnd
                ? "Obrisano manje od limita - trenutno nema više orphan ocjena za brisanje."
                : "Dostignut limit poziva - pozovi ponovo da nastaviš čišćenje preostalih orphan ocjena."}
            </p>
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
