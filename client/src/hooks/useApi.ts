import { useCallback, useEffect, useState } from "react";
import { apiGet, type ApiResult } from "../api/client";

interface UseApiResult<T> {
  result: ApiResult<T> | null;
  error: string | null;
  loading: boolean;
  /** Ponovo šalje isti GET zahtjev (npr. na klik "Pošalji zahtjev" dugmeta). */
  refetch: () => void;
}

/**
 * Šalje GET zahtjev na dati "path" i automatski ga ponavlja svaki put kad se
 * "path" promijeni (npr. kad korisnik prebaci toggle za bazu ili režim u
 * sidebaru, App.tsx sastavi novi path i ovaj hook sam okine novi zahtjev).
 *
 * NAPOMENA o loading/error resetu: "resetuj na loading=true i obriši staru
 * grešku" se NAMJERNO ne radi sinhronim setState pozivom na početku
 * useEffect-a (to react-hooks/set-state-in-effect pravilo prijavljuje kao
 * grešku - cascading renders). Umjesto toga koristi se dokumentovani React
 * pattern "adjusting state when a prop changes" (poređenje sa prethodnom
 * vrijednosti TOKOM render-a - vidi https://react.dev/reference/react/useState#storing-information-from-previous-renders),
 * a za refetch() isti reset radi unutar event handlera (tamo je setState
 * potpuno uobičajen i nije problem).
 */
export function useApi<T>(path: string): UseApiResult<T> {
  const [result, setResult] = useState<ApiResult<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState(0);

  const [prevPath, setPrevPath] = useState(path);
  if (prevPath !== path) {
    setPrevPath(path);
    setLoading(true);
    setError(null);
    setRequestId((id) => id + 1);
  }

  useEffect(() => {
    let cancelled = false;

    apiGet<T>(path)
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Zahtjev nije uspio.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // path i requestId zajedno okidaju efekat: path kad se promijeni izbor u
    // sidebaru, requestId kad se pozove refetch() nad ISTIM path-om.
  }, [path, requestId]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    setRequestId((id) => id + 1);
  }, []);

  return { result, error, loading, refetch };
}
