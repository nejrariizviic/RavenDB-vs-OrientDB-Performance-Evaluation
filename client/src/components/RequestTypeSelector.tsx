import type { ComponentType } from "react";
import { FilmIcon, SearchIcon, StarIcon, TrophyIcon } from "./icons";
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
};

/**
 * Vizuelni birač tipa zahtjeva - zamjenjuje ranije "obične" boxed tabove
 * (QueryTypeTabs.tsx, koji je pokrivao samo 2 GET upita) kartičnim
 * prikazom SVA ČETIRI demonstrirana zahtjeva (2x GET, 2x POST). Svaka
 * kartica nosi HTTP metodu (bedž), ikonicu, naslov, kratak opis i oznaku
 * jednostavan/složen - tako se odmah vidi ŠTA upit radi, umjesto pukog
 * naslova taba.
 *
 * Odabrana kartica ne šalje ništa sama od sebe: za GET upite (by-id,
 * top-rated) ResponsePanel.tsx ispod i dalje prikazuje pripadajuću formu za
 * potvrdu parametara, a za POST upite (add-movie, add-rating) prikazuje
 * dugme koje otvara odgovarajući popup (vidi App.tsx).
 */
export function RequestTypeSelector({ value, onChange, disabled }: RequestTypeSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Tip zahtjeva"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
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
              <span
                className={`badge badge-sm badge-outline ${
                  meta.method === "GET" ? "badge-info" : "badge-success"
                }`}
              >
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
