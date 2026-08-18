import { formatBytesDelta, formatMs } from "../lib/format";

interface MetricsTableProps {
  tookMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssDeltaBytes: number;
  heapUsedDeltaBytes: number;
}

/**
 * Tabela benchmark metrika (trajanje, CPU, RAM) - izdvojena iz
 * MovieQueryResult.tsx da bi je mogao koristiti i TopRatedResult.tsx
 * (prikaz "složenog" GET upita), bez dupliranja markup-a.
 */
export function MetricsTable({
  tookMs,
  cpuUserMs,
  cpuSystemMs,
  rssDeltaBytes,
  heapUsedDeltaBytes,
}: MetricsTableProps) {
  const metrics: Array<{ label: string; value: string; hint: string }> = [
    { label: "Trajanje upita", value: formatMs(tookMs), hint: "process.hrtime, samo poziv bazi" },
    { label: "CPU (user)", value: formatMs(cpuUserMs), hint: "CPU vrijeme u user modu" },
    { label: "CPU (system)", value: formatMs(cpuSystemMs), hint: "CPU vrijeme u kernel modu" },
    { label: "RSS memorija", value: formatBytesDelta(rssDeltaBytes), hint: "delta rezidentne memorije procesa" },
    { label: "Heap memorija", value: formatBytesDelta(heapUsedDeltaBytes), hint: "delta zauzetog V8 heap-a" },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-base-content/70 mb-2">Metrike upita</h3>
      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table">
          <thead>
            <tr>
              <th>Metrika</th>
              <th>Vrijednost</th>
              <th className="hidden sm:table-cell">Opis</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td className="font-medium">{m.label}</td>
                <td className="font-mono">{m.value}</td>
                <td className="hidden sm:table-cell text-sm text-base-content/60">{m.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
