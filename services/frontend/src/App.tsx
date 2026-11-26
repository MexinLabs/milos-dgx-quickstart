import { useCallback, useEffect, useState } from "react";
import logo from "./assets/milos-isologo.png";
import { GpuPanel } from "./components/GpuPanel";
import { cx } from "./components/ui";
import { getJson, type Config } from "./lib/api";
import { AgentsTab } from "./tabs/AgentsTab";
import { ChatTab } from "./tabs/ChatTab";
import { VisionTab } from "./tabs/VisionTab";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "vision", label: "Visión" },
  { id: "agentes", label: "Agentes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const MODEL_KEY = "milos.model";

function tabFromHash(): TabId {
  const id = window.location.hash.slice(1);
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : "chat";
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [offline, setOffline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>(() => sessionStorage.getItem(MODEL_KEY) ?? "");
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Config and models are re-read all the time: the UI can come up before the
  // backend, the backend restarts when .env changes, and a model that finishes
  // downloading during the session has to show up without a reload.
  const refresh = useCallback(async () => {
    try {
      const [nextConfig, nextModels] = await Promise.all([
        getJson<Config>("/api/config"),
        getJson<{ models: string[] }>("/api/models").catch(() => null),
      ]);
      setConfig(nextConfig);
      if (nextModels) setModels(nextModels.models);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, offline ? 3000 : 10000);
    return () => clearInterval(timer);
  }, [refresh, offline]);

  // The model of this session: the last one picked, else the server's default.
  const selected = model && (models.length === 0 || models.includes(model)) ? model : (config?.llm_model ?? "");
  const options = selected && !models.includes(selected) ? [selected, ...models] : models;

  const pickModel = (next: string) => {
    setModel(next);
    sessionStorage.setItem(MODEL_KEY, next);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-brand px-5 py-2.5 text-white">
        <h1 className="flex items-center gap-3 text-xl font-bold whitespace-nowrap">
          <img src={logo} alt="" className="size-9 brightness-0 invert" />
          <span>
            milOS-DGX Quickstart <span className="font-normal opacity-80">| {config?.client_name ?? "…"}</span>
          </span>
        </h1>

        <nav className="flex gap-1.5" role="tablist" aria-label="Demos">
          {TABS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              className={cx(
                "rounded-lg px-5 py-1.5 text-lg font-semibold transition-colors",
                tab === item.id ? "bg-white text-brand" : "text-white hover:bg-white/15",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1">
          <label className="flex items-center gap-2">
            <span className="text-sm opacity-85">Modelo de texto</span>
            <select
              value={selected}
              onChange={(event) => pickModel(event.target.value)}
              onFocus={refresh}
              onMouseDown={refresh}
              className="rounded-lg border-0 bg-white px-3 py-1.5 font-mono text-[0.95rem] font-semibold text-ink"
            >
              {options.length === 0 && <option value="">(sin modelos)</option>}
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {name === config?.llm_model ? "  (predeterminado)" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm max-2xl:hidden">
            <span className="opacity-85">Visión </span>
            <span className="font-mono font-semibold">{config?.vlm_model ?? "…"}</span>
          </span>
        </div>
      </header>

      {offline && (
        <p role="alert" className="bg-danger px-5 py-1.5 font-semibold text-white">
          Sin conexión con el backend; reintentando. Revisa con: docker compose ps
        </p>
      )}

      <div className="flex min-h-0 flex-1 max-xl:flex-col">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          <div className={tab === "chat" ? "h-full" : "hidden"}>
            <ChatTab model={selected} />
          </div>
          <div className={tab === "vision" ? "h-full" : "hidden"}>
            <VisionTab model={config?.vlm_model ?? ""} active={tab === "vision"} />
          </div>
          <div className={tab === "agentes" ? "h-full" : "hidden"}>
            <AgentsTab model={selected} active={tab === "agentes"} />
          </div>
        </main>
        <div className="max-xl:order-first xl:contents">
          <GpuPanel />
        </div>
      </div>
    </div>
  );
}
