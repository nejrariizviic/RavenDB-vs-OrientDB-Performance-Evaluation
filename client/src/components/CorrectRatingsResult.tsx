/**
 * Prikazuje odgovor PUT /api/movies/:dbEngine/ratings/correction rute
 * (SLOŽEN PUT - korekcija ocjena za "aktivne" korisnike) u čitljivom
 * obliku, analogno RatingQueryResult.tsx (SLOŽEN POST), samo što ovdje
 * odgovor ne nosi JEDAN zapis nego SKUP pogođenih zapisa (data.data nema
 * jedan movieId/userId - vidi movie.controller.js -> correctActiveUsersRatings),
 * pa je i prikaz oblikovan kao "statistika operacije" umjesto kartice
 * jednog resursa.
 *
 * Oblik uspješnog odgovora (uvijek HTTP 200, i kad nema aktivnih korisnika -
 * "no_active_users" NIJE greška, samo znači da ništa nije izmijenjeno):
 *   {
 *     success: true,
 *     engine: "ravendb" | "orientdb",
 *     tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes,
 *     message: string,
 *     data: { activeUsersCount, updatedRatingsCount, maxActiveUsers }
 *   }
 *
 * "delta" i "minRatings" koje je korisnik poslao NISU dio ovog odgovora
 * (BE ih ne vraća nazad, vidi controller) - CorrectRatingsModal.tsx ih zato
 * prosljeđuje ovom komponentu direktno iz svog forme-state-a (isti duh kao
 * "movieIdInput ostaje potvrđena vrijednost" u ostatku aplikacije).
 */
import { EngineBadge } from "./EngineBadge";
import { MetricsTable } from "./MetricsTable";
import { TrendDownIcon, TrendUpIcon, UsersIcon, WrenchIcon } from "./icons";

interface CorrectRatingsData {
  activeUsersCount: number;
  updatedRatingsCount: number;
  maxActiveUsers: number | null;
}

interface CorrectRatingsSuccess {
  success: true;
  engine: string;
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
  message: string;
  data: CorrectRatingsData;
}

/** Type guard - provjerava da body odgovara očekivanom obliku uspješnog odgovora "korekcija ocjena" upita. */
export function isCorrectRatingsSuccess(body: unknown): body is CorrectRatingsSuccess {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.success !== true || typeof b.engine !== "string") return false;
  if (typeof b.tookMs !== "number") return false;
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return false;
  const data = b.data as Record<string, unknown>;
  return (
    typeof data.activeUsersCount === "number" && typeof data.updatedRatingsCount === "number"
  );
}

interface CorrectRatingsResultProps {
  body: CorrectRatingsSuccess;
  /** Delta koju je korisnik poslao (potvrđena forma-vrijednost, vidi napomenu u dokblocku iznad). */
  appliedDelta: number;
  /** Prag "aktivnog" korisnika koji je korisnik poslao (potvrđena forma-vrijednost). */
  appliedMinRatings: number;
}

export function CorrectRatingsResult({
  body,
  appliedDelta,
  appliedMinRatings,
}: CorrectRatingsResultProps) {
  const { engine, data, tookMs, cpuUserMs, cpuSystemMs, rssDeltaBytes, heapUsedDeltaBytes } = body;

  const hasUpdates = data.updatedRatingsCount > 0;
  const isPositiveDelta = appliedDelta > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Kartica operacije - statistika umjesto kartice jednog resursa (vidi dokblok iznad). */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-warning/15 text-warning p-2">
                <WrenchIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="card-title text-xl leading-tight">
                  {hasUpdates ? "Korekcija primijenjena" : "Nema aktivnih korisnika"}
                </h2>
                <p className="text-sm text-base-content/60 mt-0.5">{body.message}</p>
              </div>
            </div>
            <EngineBadge engine={engine} />
          </div>

          {/* Statistika operacije (daisyUI "stats") - tri ključna broja jednog pogleda.
              NAMJERNO "@container" + "@lg:" (container query, Tailwind v4) umjesto
              običnog "sm:" (viewport) - ova komponenta se renderuje i unutar uskog
              modala (CorrectRatingsModal.tsx, max-w-lg) i u širokom glavnom panelu
              (ResponsePanel.tsx), pa horizontalni raspored treba zavisiti od širine
              STVARNOG kontejnera, ne cijelog viewport-a (inače bi se 3 stat-a
              nagurala u uzak modal na širem ekranu). */}
          <div className="@container">
            <div className="stats stats-vertical @lg:stats-horizontal shadow-sm border border-base-300 bg-base-100 w-full">
              <div className="stat">
                <div className="stat-figure text-primary">
                  <UsersIcon className="h-6 w-6" />
                </div>
                <div className="stat-title">Aktivnih korisnika</div>
                <div className="stat-value text-primary text-2xl">{data.activeUsersCount}</div>
                <div className="stat-desc">&gt; {appliedMinRatings} ocjena</div>
              </div>

              <div className="stat">
                <div className={`stat-figure ${isPositiveDelta ? "text-success" : "text-error"}`}>
                  {isPositiveDelta ? (
                    <TrendUpIcon className="h-6 w-6" />
                  ) : (
                    <TrendDownIcon className="h-6 w-6" />
                  )}
                </div>
                <div className="stat-title">Korekcija (delta)</div>
                <div
                  className={`stat-value text-2xl ${isPositiveDelta ? "text-success" : "text-error"}`}
                >
                  {isPositiveDelta ? "+" : ""}
                  {appliedDelta}
                </div>
                <div className="stat-desc">primijenjeno na ocjene &lt; 3</div>
              </div>

              <div className="stat">
                <div className="stat-figure text-secondary">
                  <WrenchIcon className="h-6 w-6" />
                </div>
                <div className="stat-title">Ažurirano ocjena</div>
                <div className="stat-value text-secondary text-2xl">
                  {data.updatedRatingsCount}
                </div>
                <div className="stat-desc">
                  {data.maxActiveUsers
                    ? `ograničeno na ${data.maxActiveUsers} korisnika (dev test)`
                    : "bez ograničenja broja korisnika"}
                </div>
              </div>
            </div>
          </div>
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
