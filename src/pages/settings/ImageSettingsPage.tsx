/**
 * ImageSettingsPage — image endpoint backing the generate_image tool.
 * Same shape as SttSettingsPage: connect, pick a model, auto-save.
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

export function ImageSettingsPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [baseUrl, setBaseUrl] = useState(settings.imageBaseUrl);
  const [apiKey, setApiKey] = useState(settings.imageApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(settings.imageModel);
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
    if (!settings.imageBaseUrl || !settings.imageApiKey) return;
    didAutoFetch.current = true;

    (async () => {
      setPulling(true);
      try {
        setFetchedModels(await doFetch(settings.imageBaseUrl, settings.imageApiKey));
        setConnected(true);
      } catch {
        setConnected(null);
      } finally {
        setPulling(false);
      }
    })();
  }, [settings.imageBaseUrl, settings.imageApiKey, doFetch]);

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
      updateSettings({
        imageBaseUrl: baseUrl.trim(),
        imageApiKey: apiKey.trim(),
        imageModel: selectedModel,
      });
    } catch {
      setConnected(false);
    } finally {
      setTesting(false);
    }
  };

  const handleSelectModel = (id: string) => {
    setModel(id);
    updateSettings({ imageBaseUrl: baseUrl.trim(), imageApiKey: apiKey.trim(), imageModel: id });
  };

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    if (value.trim() !== settings.imageBaseUrl) {
      setConnected(null);
      setFetchedModels([]);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (value.trim() !== settings.imageApiKey) {
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
        <p className="text-muted-foreground px-1 text-[13px] leading-relaxed">
          {t("settings.imageHint")}
        </p>

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
              placeholder="https://api.openai.com/v1"
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

        {/* Current model */}
        {settings.imageModel && settings.imageApiKey && (
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
                {settings.imageModel}
              </p>
            </div>
          </div>
        )}

        {/* Connect */}
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
              ? `✓ ${t("providerEdit.connected")}`
              : connected === false
                ? t("providerEdit.retryConnection")
                : t("providerEdit.connectAndFetch")}
        </button>

        {/* Model list */}
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
