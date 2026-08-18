import { useState } from "react";

/**
 * Generički hook za state koji se sinhronizuje sa localStorage-om pod datim
 * ključem. Vrijednost se čita samo jednom, prilikom prve inicijalizacije
 * (lazy initializer), a svaka naredna promjena se odmah upisuje nazad u
 * localStorage - koristi se za pamćenje odabira baze (RavenDB/OrientDB) i
 * režima (optimizovano/neoptimizovano) između refresh-ova stranice.
 */
export function useLocalStorageState<T extends string>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? (stored as T) : defaultValue;
    } catch {
      // localStorage može biti nedostupan (npr. privatni mod preglednika) -
      // u tom slučaju samo radimo sa podrazumijevanom vrijednošću.
      return defaultValue;
    }
  });

  const update = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Ignorišemo - vrijednost i dalje radi u okviru trenutne sesije,
      // samo se neće zapamtiti nakon refresh-a.
    }
  };

  return [value, update];
}
