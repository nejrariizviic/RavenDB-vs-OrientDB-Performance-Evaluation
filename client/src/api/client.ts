const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Greška ${res.status}`);
  }
  return res.json() as Promise<T>;
}