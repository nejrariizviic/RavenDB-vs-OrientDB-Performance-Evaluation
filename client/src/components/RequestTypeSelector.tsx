import type { ComponentType } from "react";
import { FilmIcon, PencilIcon, SearchIcon, StarIcon, TrophyIcon } from "./icons";
import { REQUEST_KINDS, type RequestKind } from "../lib/requestKind";

interface RequestTypeSelectorProps {
  value: RequestKind;
  onChange: (value: RequestKind) => void;
  disabled?: boolean;
}

const ICON_BY_KIND: Record<RequestKind, ComponentType<{ className?: string }>> = {
  "by-id": SearchIcon,
  "top-rated": TrophyIcon,
  "add-movie": FilmIcon,
  "add-rating": StarIcon,
  "edit-title": PencilIcon,
};

/** Boja bedža po HTTP metodi - GET plavo, POST zeleno, PUT žuto/narandžasto (uobičajena REST konvencija). */
const BADGE_CLASS_BY_METHOD: Record<(typeof REQUEST_KINDS)[number]["method"], string> = {
  GET: "badge-info",
  POST: "badge-success",
  PUT: "badge-warning",
};

/**
 * Vizuelni birač tipa zahtjeva - zamjenjuje ranije "obične" boxed tabove
 * (QueryTypeTabs.tsx, koji je pokrivao samo 2 GET upita) kartičnim
 * prikazom SVIH PET demonstriranih zahtjeva (2x GET, 2x POST, 1x PUT).
 * Svaka kartica nosi HTTP metodu (bedž), ikonicu, naslov, kratak opis i
 * oznaku jednostavan/složen - tako se odmah vidi ŠTA upit radi, umjesto
 * pukog naslova taba.
 *
 * Odabrana kartica ne šalje ništa sama od sebe: za GET upite (by-id,
 * top-rated) ResponsePanel.tsx ispod i dalje prikazuje pripadajuću formu za
 * potvrdu parametara, a za mutacije (add-movie, add-rating, edit-title)
 * prikazuje dugme koje otvara odgovarajući popup (vidi App.tsx).
 */
export function RequestTypeSelector({ value, onChange, disabled }: RequestTypeSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Tip zahtjeva"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6"
    >
      {REQUEST_KINDS.map((meta) => {
        const Icon = ICON_BY_KIND[meta.kind];
        const isActive = value === meta.kind;
        return (
          <button
            key={meta.kind}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(meta.kind)}
            className={`text-left rounded-box border p-4 flex flex-col gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              isActive
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-base-300 bg-base-200/40 hover:bg-base-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`badge badge-sm badge-outline ${BADGE_CLASS_BY_METHOD[meta.method]}`}>
                {meta.method}
              </span>
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-base-content/40"}`} />
            </div>

            <div>
              <p className="text-sm font-semibold leading-snug">{meta.title}</p>
              <p className="text-xs text-base-content/60 mt-0.5 leading-snug">
                {meta.description}
              </p>
            </div>

            <span className="text-[10px] uppercase tracking-wide text-base-content/40 font-medium">
              {meta.complexity === "simple" ? "Jednostavan upit" : "Složen upit"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
