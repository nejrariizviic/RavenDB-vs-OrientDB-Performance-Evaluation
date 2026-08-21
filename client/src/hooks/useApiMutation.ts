import { useCallback, useState } from "react";
import { apiDelete, apiPost, apiPut, type ApiResult } from "../api/client";

type MutationMethod = "POST" | "PUT" | "DELETE";

interface UseApiMutationResult<T> {
  result: ApiResult<T> | null;
  error: string | null;
  loading: boolean;
  /**
   * Šalje POST ili PUT zahtjev (podrazumijevano POST, radi kompatibilnosti
   * sa postojećim pozivima za "dodaj film"/"dodaj ocjenu") na dati "path" sa
   * datim JSON tijelom. Za razliku od useApi (koji se auto-refetch-uje kad
   * se path promijeni), ovaj hook se NIKAD ne okida sam - mutacija (npr.
   * "dodaj novi film" ili "izmijeni naslov filma") mora biti eksplicitno
   * pokrenuta (submit forme), da se izbjegne slučajno slanje zahtjeva samo
   * zato što je korisnik promijenio toggle u sidebaru.
   */
  mutate: (path: string, payload: unknown, method?: MutationMethod) => Promise<void>;
  /** Briše prethodni rezultat/grešku (npr. pri otvaranju modala ili "Dodaj još jedan film"). */
  reset: () => void;
}

/**
 * Analogno useApi.ts, ali za POST/PUT/DELETE (mutacije) - vidi JSDoc uz
 * "mutate" polje za ključnu razliku u odnosu na useApi (nema automatskog
 * okidanja). Isti hook opslužuje "dodaj film"/"dodaj ocjenu" (POST),
 * "izmijeni naslov filma" (PUT) i "obriši tag" (DELETE) - jedina razlika je
 * koja se HTTP metoda proslijedi.
 */
export function useApiMutation<T>(): UseApiMutationResult<T> {
  const [result, setResult] = useState<ApiResult<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(async (path: string, payload: unknown, method: MutationMethod = "POST") => {
    setLoading(true);
    setError(null);

    try {
      const res =
        method === "PUT"
          ? await apiPut<T>(path, payload)
          : method === "DELETE"
            ? await apiDelete<T>(path, payload)
            : await apiPost<T>(path, payload);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahtjev nije uspio.");
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, error, loading, mutate, reset };
}
