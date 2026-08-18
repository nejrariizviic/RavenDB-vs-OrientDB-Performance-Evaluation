const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
}

/**
 * Šalje GET zahtjev ka BE-u i vraća HTTP status kod zajedno sa parsiranim
 * JSON tijelom, BEZ OBZIRA na to da li je odgovor uspješan (2xx) ili ne.
 *
 * Namjerno se ne baca greška na 4xx/5xx status: kod ove aplikacije i sam
 * "neuspješan" odgovor (npr. konekcija ka bazi nije uspjela) nosi koristan
 * JSON sa detaljima (vidi connection.controller.js na BE), pa ga korisnik
 * treba vidjeti u cijelosti, a ne samo generičku poruku o grešci.
 *
 * Greška se baca SAMO ako sam zahtjev nije uspio da stigne do servera
 * (npr. server ugašen, pogrešan URL, CORS) - tu grešku hvata pozivalac.
 */
export async function apiGet<T = unknown>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`);

  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null as T;
  }

  return { status: res.status, ok: res.ok, body };
}
