import type { QueryType } from "../lib/queryType";

interface QueryTypeTabsProps {
  value: QueryType;
  onChange: (value: QueryType) => void;
  disabled?: boolean;
}

/**
 * Tab prekidač u glavnom panelu, iznad prikaza odgovora - bira se koji se
 * GET upit šalje: jednostavan (po ID-u) ili složen (Top N po ocjeni).
 * Odgovarajuća forma (ID filma vs. limit/minRatings) i prikaz odgovora se
 * mijenjaju u ResponsePanel.tsx u zavisnosti od ove vrijednosti.
 */
export function QueryTypeTabs({ value, onChange, disabled }: QueryTypeTabsProps) {
  return (
    <div role="tablist" className="tabs tabs-boxed w-fit mb-4">
      <button
        type="button"
        role="tab"
        className={`tab ${value === "by-id" ? "tab-active" : ""}`}
        onClick={() => onChange("by-id")}
        disabled={disabled}
      >
        Jednostavan GET - film po ID-u
      </button>
      <button
        type="button"
        role="tab"
        className={`tab ${value === "top-rated" ? "tab-active" : ""}`}
        onClick={() => onChange("top-rated")}
        disabled={disabled}
      >
        Složen GET - Top N po ocjeni
      </button>
    </div>
  );
}
