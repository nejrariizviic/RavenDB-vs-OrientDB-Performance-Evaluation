import { useCallback, useState } from "react";
import { apiPost, type ApiResult } from "../api/client";

interface UseApiMutationResult<T> {
  result: ApiResult<T> | null;
  error: string | null;
  loading: boolean;
  /**
   * Šalje POST zahtjev na dati "path" sa datim JSON tijelom. Za razliku od
   * useApi (koji se auto-refetch-uje kad se path promijeni), ovaj hook se
   * NIKAD ne okida sam - mutacija (npr. "dodaj novi film") mora biti
   * eksplicitno pokrenuta (submit forme), da se izbjegne slučajno slanje
   * POST zahtjeva samo zato što je korisnik promijenio toggle u sidebaru.
   */
  mutate: (path: string, payload: unknown) => Promise<void>;
  /** Briše prethodni rezultat/grešku (npr. pri otvaranju modala ili "Dodaj još jedan film"). */
  reset: () => void;
}

/**
 * Analogno useApi.ts, ali za POST (mutacije) - vidi JSDoc uz "mutate" polje
 * za ključnu razliku u odnosu na useApi (nema automatskog okidanja).
 */
export function useApiMutation<T>(): UseApiMutationResult<T> {
  const [result, setResult] = useState<ApiResult<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(async (path: string, payload: unknown) => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiPost<T>(path, payload);
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
