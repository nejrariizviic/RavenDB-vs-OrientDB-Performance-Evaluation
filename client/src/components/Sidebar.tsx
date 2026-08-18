import { LabeledToggle } from "./LabeledToggle";
import type { DbEngine, DbMode } from "../lib/dbPreferences";

interface SidebarProps {
  dbEngine: DbEngine;
  onDbEngineChange: (engine: DbEngine) => void;
  dbMode: DbMode;
  onDbModeChange: (mode: DbMode) => void;
  disabled?: boolean;
}

export function Sidebar({
  dbEngine,
  onDbEngineChange,
  dbMode,
  onDbModeChange,
  disabled,
}: SidebarProps) {
  return (
    <aside className="w-72 shrink-0 border-r border-base-300 bg-base-200/60 p-6 flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-bold leading-tight">MovieLens Benchmark</h1>
        <p className="text-sm text-base-content/60 mt-1">RavenDB vs OrientDB</p>
      </div>

      <div className="flex flex-col gap-6">
        <LabeledToggle
          id="db-engine-toggle"
          label="Baza podataka"
          leftLabel="RavenDB"
          rightLabel="OrientDB"
          checked={dbEngine === "orientdb"}
          onChange={(checked) => onDbEngineChange(checked ? "orientdb" : "ravendb")}
          disabled={disabled}
        />

        <LabeledToggle
          id="db-mode-toggle"
          label="Režim baze"
          leftLabel="Neoptimizovano"
          rightLabel="Optimizovano"
          checked={dbMode === "optimized"}
          onChange={(checked) => onDbModeChange(checked ? "optimized" : "unoptimized")}
          disabled={disabled}
        />
      </div>

      <div className="mt-auto rounded-lg bg-base-100 border border-base-300 p-4 text-xs text-base-content/60 leading-relaxed">
        Odabir se pamti u <code className="text-[11px]">localStorage</code>-u i šalje se uz svaki
        zahtjev - baza kroz putanju (<code className="text-[11px]">/movies/{"{"}baza{"}"}/{"{"}id{"}"}</code>),
        a režim kroz <code className="text-[11px]">?optimized=</code> query parametar.
      </div>
    </aside>
  );
}
