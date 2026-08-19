import { StarIcon } from "./icons";

const STAR_COUNT = 5;

interface StarRowProps {
  value: number;
  starClassName: string;
}

/**
 * Zajednički vizuelni prikaz 5 zvjezdica sa DJELIMIČNIM popunjavanjem
 * (npr. 3.5 -> tri pune + pola) - crta se kao dva sloja iste ikonice
 * (StarIcon iz icons.tsx): siva "prazna" pozadina i obojen "popunjen" sloj
 * čija se širina obrezuje (overflow-hidden) prema procentu ocjene po
 * zvjezdici. Koristi ga i StarRatingDisplay (samo za čitanje) i
 * StarRatingInput (interaktivni birač) ispod, da se ne duplira SVG logika.
 */
function StarRow({ value, starClassName }: StarRowProps) {
  return (
    <>
      {Array.from({ length: STAR_COUNT }, (_, i) => {
        const fillPercent = Math.max(0, Math.min(1, value - i)) * 100;
        return (
          <div key={i} className={`relative ${starClassName}`}>
            <StarIcon className={`absolute inset-0 ${starClassName} text-base-300`} />
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{ width: `${fillPercent}%` }}
            >
              <StarIcon className={`${starClassName} text-warning`} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Prikaz ocjene SAMO za čitanje (npr. u RatingQueryResult.tsx, nakon što je
 * ocjena uspješno dodata preko SLOŽENOG POST upita).
 */
export function StarRatingDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        <StarRow value={value} starClassName="h-6 w-6" />
      </div>
      <span className="font-mono text-sm font-semibold text-base-content/70">
        {value.toFixed(1)} / 5
      </span>
    </div>
  );
}

interface StarRatingInputProps {
  /** Vrijednost ocjene, 0.5 - 5, u koracima od 0.5. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Interaktivni birač ocjene (0.5 - 5, korak 0.5, isti opseg koji BE
 * validira - vidi movie.controller.js -> addRating) - klik na LIJEVU
 * polovinu zvjezdice postavlja "X.5", klik na DESNU postavlja "X+1", nad
 * istim vizuelnim prikazom kao StarRatingDisplay (samo sa dvije nevidljive
 * dugmadi preko svake zvjezdice).
 */
export function StarRatingInput({ value, onChange, disabled }: StarRatingInputProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5" role="radiogroup" aria-label="Ocjena">
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const half = i + 0.5;
          const full = i + 1;
          const fillPercent = Math.max(0, Math.min(1, value - i)) * 100;
          return (
            <div key={i} className="relative h-8 w-8">
              <StarIcon className="absolute inset-0 h-8 w-8 text-base-300" />
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ width: `${fillPercent}%` }}
              >
                <StarIcon className="h-8 w-8 text-warning" />
              </div>
              <button
                type="button"
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer disabled:cursor-not-allowed"
                disabled={disabled}
                onClick={() => onChange(half)}
                aria-label={`${half} od 5 zvjezdica`}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer disabled:cursor-not-allowed"
                disabled={disabled}
                onClick={() => onChange(full)}
                aria-label={`${full} od 5 zvjezdica`}
              />
            </div>
          );
        })}
      </div>
      <span className="font-mono text-sm font-semibold w-10">{value.toFixed(1)}</span>
    </div>
  );
}
