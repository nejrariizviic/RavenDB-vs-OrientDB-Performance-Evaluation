import { useApi } from "./hooks/useApi";

interface ConnectionResult {
  success: boolean;
  message: string;
}

interface ConnectionStatusResponse {
  success: boolean;
  ravendb: ConnectionResult;
  orientdb: ConnectionResult;
}

function App() {
  const { data, error, loading } = useApi<ConnectionStatusResponse>("/connection/status");

  if (loading) return <p>Provjera konekcije...</p>;
  if (error) return <p style={{ color: "red" }}>Greška: {error}</p>;

  return (
    <div>
      <h1>Status konekcije prema bazama</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default App;