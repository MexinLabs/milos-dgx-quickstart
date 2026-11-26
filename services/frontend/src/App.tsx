import { useEffect, useState } from "react";

type Config = { client_name: string; llm_model: string; vlm_model: string };

// Skeleton only: proves the frontend -> backend path.
export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setConfig)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: "Arial, sans-serif", padding: 32 }}>
      <h1>milOS-DGX Quickstart | {config?.client_name ?? "…"}</h1>
      {error && <p>Backend no disponible: {error}</p>}
      {config && (
        <ul>
          <li>LLM: {config.llm_model}</li>
          <li>VLM: {config.vlm_model}</li>
        </ul>
      )}
    </main>
  );
}
