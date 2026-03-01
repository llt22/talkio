/**
 * SttSettingsPage — STT provider configuration (1:1 RN original).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  IoLinkOutline,
  IoKeyOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoCloseCircle,
  IoCheckmarkCircle,
} from "../../icons";
import { useSettingsStore } from "../../stores/settings-store";
import { appFetch } from "../../lib/http";

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
  const [connected, setConnected] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const didAutoFetch = useRef(false);

  const doFetch = useCallback(async (url: string, key: string) => {
    const endpoint = url.replace(/\/+$/, "") + "/models";
    const res = await appFetch(endpoint, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("Connection failed");
    const data = await res.json();
    return ((data.data ?? []) as Array<{ id: string }>).map((m) => m.id).sort();
  }, []);

  // Auto-fetch models on mount when already configured
  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!settings.sttBaseUrl || !settings.sttApiKey) return;
    didAutoFetch.current = true;

    (async () => {
      setPulling(true);
      try {
        const ids = await doFetch(settings.sttBaseUrl, settings.sttApiKey);
        setFetchedModels(ids);
        setConnected(true);
      } catch {
        setConnected(null);
      } finally {
        setPulling(false);
      }
    })();
  }, [settings.sttBaseUrl, settings.sttApiKey, doFetch]);

  const handleConnect = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setTesting(true);
    setConnected(null);

    try {
      const ids = await doFetch(baseUrl.trim(), apiKey.trim());
      setConnected(true);
      setFetchedModels(ids);

      const selectedModel = ids.includes(model) ? model : (ids[0] ?? model);
      setModel(selectedModel);

      // Auto-save on successful connect
      updateSettings({
        sttBaseUrl: baseUrl.trim(),
        sttApiKey: apiKey.trim(),
        sttModel: selectedModel,
      });
    } catch {
      setConnected(false);
    } finally {
      setTesting(false);
    }
  };

  const handleSelectModel = (id: string) => {
    setModel(id);
    updateSettings({ sttBaseUrl: baseUrl.trim(), sttApiKey: apiKey.trim(), sttModel: id });
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    if (value.trim() !== settings.sttBaseUrl) {
      setConnected(null);
      setFetchedModels([]);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (value.trim() !== settings.sttApiKey) {
      setConnected(null);
      setFetchedModels([]);
    }
  };

  const displayModels = modelSearch
    ? fetchedModels.filter((id) => id.toLowerCase().includes(modelSearch.toLowerCase()))
    : fetchedModels;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 pb-10">
        {/* Presets */}
        <div className="flex gap-2">
          {STT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                handleBaseUrlChange(preset.baseUrl);
              }}
              className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold transition-colors active:opacity-70"
              style={{
                backgroundColor:
                  baseUrl === preset.baseUrl
                    ? "color-mix(in srgb, var(--primary) 5%, var(--card))"
                    : "var(--card)",
                border:
                  baseUrl === preset.baseUrl
                    ? "1px solid var(--primary)"
                    : "1px solid var(--border)",
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
            <IoLinkOutline
              size={18}
              color="var(--muted-foreground)"
              className="mr-3 flex-shrink-0"
            />
            <input
              className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
            />
          </div>
        </div>

        {/* API Key */}
        <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
          <div className="flex items-center px-4 py-3.5">
            <IoKeyOutline
              size={18}
              color="var(--muted-foreground)"
              className="mr-3 flex-shrink-0"
            />
            <input
              type={showApiKey ? "text" : "password"}
              className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={t("settings.sttApiKeyPlaceholder")}
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="ml-2 p-1 active:opacity-60"
            >
              {showApiKey ? (
                <IoEyeOffOutline size={20} color="var(--muted-foreground)" />
              ) : (
                <IoEyeOutline size={20} color="var(--muted-foreground)" />
              )}
            </button>
          </div>
        </div>

        {/* Current Model Indicator */}
        {settings.sttModel && settings.sttApiKey && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{
              backgroundColor: "color-mix(in srgb, var(--success) 8%, var(--card))",
              border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
            }}
          >
            <IoCheckmarkCircle size={18} color="var(--success)" className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[12px]">{t("settings.currentModel")}</p>
              <p className="text-foreground truncate text-[15px] font-semibold">
                {settings.sttModel}
              </p>
            </div>
          </div>
        )}

        {/* Connect Button */}
        <button
          className="mt-1 w-full rounded-xl py-3.5 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
          disabled={testing || pulling || !baseUrl.trim() || !apiKey.trim()}
          onClick={handleConnect}
          style={{
            backgroundColor:
              connected === true
                ? "var(--success)"
                : connected === false
                  ? "var(--destructive)"
                  : "var(--primary)",
          }}
        >
          {testing || pulling
            ? pulling
              ? t("providerEdit.fetchingModels")
              : t("providerEdit.connecting")
            : connected === true
              ? `\u2713 ${t("providerEdit.connected")}`
              : connected === false
                ? t("providerEdit.retryConnection")
                : t("providerEdit.connectAndFetch")}
        </button>

        {/* Model List */}
        {(connected || displayModels.length > 0) && fetchedModels.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-muted-foreground text-[13px] font-normal tracking-tight uppercase">
                {t("settings.models")} ({displayModels.length})
              </span>
              <button
                onClick={handleConnect}
                disabled={pulling}
                className="flex items-center gap-1 text-[13px] font-medium active:opacity-60"
                style={{ color: "var(--primary)" }}
              >
                <IoRefreshOutline size={14} color="var(--primary)" />
                {t("providerEdit.refresh")}
              </button>
            </div>

            {fetchedModels.length > 5 && (
              <div
                className="mb-3 flex items-center rounded-xl px-3 py-2"
                style={{ backgroundColor: "var(--card)" }}
              >
                <IoSearchOutline size={16} color="var(--muted-foreground)" className="mr-2" />
                <input
                  className="text-foreground flex-1 bg-transparent text-[14px] outline-none"
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
                  className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-black/5"
                  style={{
                    borderBottom:
                      idx < displayModels.length - 1 ? "0.5px solid var(--border)" : "none",
                  }}
                >
                  <span className="text-foreground flex-1 truncate text-left text-[15px]">
                    {id}
                  </span>
                  {model === id && <IoCheckmarkCircle size={20} color="var(--primary)" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
