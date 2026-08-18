/**
 * Zajedničke funkcije za formatiranje benchmark metrika (vrijeme/memorija),
 * korišćene i kod prikaza jednostavnog GET-a (MovieQueryResult) i kod
 * prikaza složenog GET-a (TopRatedResult) - izdvojeno da se ne duplira.
 */

/** Formatira bajte (delta - može biti negativna) u čitljiv oblik (B/KB/MB). */
export function formatBytesDelta(bytes: number): string {
  const sign = bytes > 0 ? "+" : bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  const kb = abs / 1024;
  if (kb < 1024) return `${sign}${kb.toFixed(1)} KB`;
  return `${sign}${(kb / 1024).toFixed(2)} MB`;
}

export function formatMs(value: number): string {
  return `${value.toFixed(3)} ms`;
}
