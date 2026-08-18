/**
 * Bedž koji označava kojim je engine-om (RavenDB/OrientDB) generisan
 * prikazani odgovor - izdvojeno iz MovieQueryResult.tsx da bi ga mogao
 * koristiti i TopRatedResult.tsx (prikaz "složenog" GET upita).
 */
export function EngineBadge({ engine }: { engine: string }) {
  const isRaven = engine === "ravendb";
  return (
    <span className={`badge ${isRaven ? "badge-info" : "badge-warning"} badge-outline`}>
      {isRaven ? "RavenDB" : engine === "orientdb" ? "OrientDB" : engine}
    </span>
  );
}
