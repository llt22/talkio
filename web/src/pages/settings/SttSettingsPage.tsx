/**
 * SttSettingsPage — STT provider configuration (1:1 RN original).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoLinkOutline, IoKeyOutline, IoEyeOutline, IoEyeOffOutline, IoRefreshOutline, IoSearchOutline, IoCloseCircle, IoCheckmarkCircle } from "../../icons";
import { useSettingsStore } from "../../stores/settings-store";

const STT_PRESETS = [
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
];

export function SttSettingsPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [baseUrl, setBaseUrl] = useState(settings.sttBaseUrl);
  const [apiKey, setApiKey] = useState(settings.sttApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(settings.sttModel);
  const [modelSearch, setModelSearch] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean | null>(settings.sttApiKey ? true : null);
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);

  const handleConnect = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setTesting(true);
    setConnected(null);

    try {
      const url = baseUrl.replace(/\/+$/, "") + "/models";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (!res.ok) throw new Error("Connection failed");

      setConnected(true);
      setPulling(true);
      const data = await res.json();
      const ids = ((data.data ?? []) as Array<{ id: string }>).map((m) => m.id).sort();
      setFetchedModels(ids);
      if (ids.length > 0 && !ids.includes(model)) setModel(ids[0]);
    } catch {
      setConnected(false);
    } finally {
      setTesting(false);
      setPulling(false);
    }
  };

  const handleSelectModel = (id: string) => {
    setModel(id);
    updateSettings({ sttBaseUrl: baseUrl.trim(), sttApiKey: apiKey.trim(), sttModel: id });
  };

  const displayModels = modelSearch
    ? fetchedModels.filter((id) => id.toLowerCase().includes(modelSearch.toLowerCase()))
    : fetchedModels;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-3">
        {/* Presets */}
        <div className="flex gap-2">
          {STT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => { setBaseUrl(preset.baseUrl); setConnected(null); setFetchedModels([]); }}
              className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold active:opacity-70 transition-colors"
              style={{
                backgroundColor: baseUrl === preset.baseUrl ? "color-mix(in srgb, var(--primary) 5%, var(--card))" : "var(--card)",
                border: baseUrl === preset.baseUrl ? "1px solid var(--primary)" : "1px solid var(--border)",
                color: baseUrl === preset.baseUrl ? "var(--primary)" : "var(--muted-foreground)",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Base URL */}
        <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
          <div className="flex items-center px-4 py-3.5">
            <IoLinkOutline size={18} color="var(--muted-foreground)" className="mr-3 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent text-[16px] text-foreground outline-none"
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setConnected(null); setFetchedModels([]); }}
              placeholder="https://api.groq.com/openai/v1"
            />
          </div>
        </div>

        {/* API Key */}
        <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
          <div className="flex items-center px-4 py-3.5">
            <IoKeyOutline size={18} color="var(--muted-foreground)" className="mr-3 flex-shrink-0" />
            <input
              type={showApiKey ? "text" : "password"}
              className="flex-1 bg-transparent text-[16px] text-foreground outline-none"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setConnected(null); setFetchedModels([]); }}
              placeholder={t("settings.sttApiKeyPlaceholder")}
            />
            <button onClick={() => setShowApiKey(!showApiKey)} className="ml-2 p-1 active:opacity-60">
              {showApiKey ? <IoEyeOffOutline size={20} color="var(--muted-foreground)" /> : <IoEyeOutline size={20} color="var(--muted-foreground)" />}
            </button>
          </div>
        </div>

        {/* Connect Button */}
        <button
          className="w-full rounded-xl py-3.5 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50 mt-1"
          disabled={testing || pulling || !baseUrl.trim() || !apiKey.trim()}
          onClick={handleConnect}
          style={{ backgroundColor: connected === true ? "var(--success)" : connected === false ? "var(--destructive)" : "var(--primary)" }}
        >
          {testing || pulling
            ? (pulling ? t("providerEdit.fetchingModels") : t("providerEdit.connecting"))
            : connected === true
              ? `✓ ${t("providerEdit.connected")}`
              : connected === false
                ? t("providerEdit.retryConnection")
                : t("providerEdit.connectAndFetch")
          }
        </button>

        {/* Model List */}
        {(connected || displayModels.length > 0) && fetchedModels.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between px-1 mb-3">
              <span className="text-[13px] font-normal uppercase tracking-tight text-muted-foreground">
                {t("settings.models")} ({displayModels.length})
              </span>
              <button onClick={handleConnect} disabled={pulling} className="flex items-center gap-1 text-[13px] font-medium active:opacity-60" style={{ color: "var(--primary)" }}>
                <IoRefreshOutline size={14} color="var(--primary)" />
                {t("providerEdit.refresh")}
              </button>
            </div>

            {fetchedModels.length > 5 && (
              <div className="mb-3 flex items-center rounded-xl px-3 py-2" style={{ backgroundColor: "var(--card)" }}>
                <IoSearchOutline size={16} color="var(--muted-foreground)" className="mr-2" />
                <input
                  className="flex-1 text-[14px] text-foreground bg-transparent outline-none"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder={t("providerEdit.searchModels")}
                />
                {modelSearch && (
                  <button onClick={() => setModelSearch("")} className="active:opacity-60">
                    <IoCloseCircle size={16} color="var(--muted-foreground)" />
                  </button>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
              {displayModels.map((id: string, idx: number) => (
                <button
                  key={id}
                  onClick={() => handleSelectModel(id)}
                  className="w-full px-4 py-3.5 flex items-center justify-between active:bg-black/5 transition-colors"
                  style={{ borderBottom: idx < displayModels.length - 1 ? "0.5px solid var(--border)" : "none" }}
                >
                  <span className="flex-1 text-[15px] text-foreground text-left truncate">{id}</span>
                  {model === id && (
                    <IoCheckmarkCircle size={20} color="var(--primary)" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
