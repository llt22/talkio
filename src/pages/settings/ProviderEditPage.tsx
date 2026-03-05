/**
 * ProviderEditPage — Full-screen provider add/edit (1:1 RN original).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  IoLinkOutline,
  IoChevronForward,
  IoCaretDown,
  IoLockClosed,
  IoCheckmarkCircle,
} from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import type { Provider, ProviderType, ApiFormat, CustomHeader } from "../../types";
import { generateId } from "../../lib/id";
import { buildProviderHeadersFromRaw } from "../../services/provider-headers";
import { appFetch } from "../../lib/http";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";
import { ProviderModelList } from "./ProviderModelList";
import { ProviderConfigForm } from "./ProviderConfigForm";

type ProviderStoreState = ReturnType<typeof useProviderStore.getState>;

const PROVIDER_PRESETS: Record<string, { name: string; baseUrl: string; type: ProviderType }> = {
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", type: "openai" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", type: "openai" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", type: "openai" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", type: "openai" },
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1", type: "openai" },
  "ollama-cloud": { name: "Ollama Cloud", baseUrl: "https://ollama.com/v1", type: "openai" },
};

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: "openai", label: "OpenAI" },
];

// Inline SVG Ionicons for preset icons
const PRESET_SVG: Record<string, string> = {
  deepseek:
    "M315.7 34.7l145 145c12.5 12.5 12.5 32.8 0 45.3l-145 145c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L370.7 224H192c-17.7 0-32-14.3-32-32s14.3-32 32-32h178.7l-100.3-100.3c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0z",
  openai:
    "M168 320a24 24 0 100-48 24 24 0 000 48zm88-24a24 24 0 1048 0 24 24 0 00-48 0zm112 24a24 24 0 100-48 24 24 0 000 48z",
  openrouter:
    "M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48zm-11 365a16 16 0 01-16-16V179.84l-46.21 54.38a16 16 0 01-24.42-20.64l74.4-87.81a16.23 16.23 0 0124.38-.09l75.15 87.9a16 16 0 01-24.3 20.84L261 179.65V397a16 16 0 01-16 16z",
  groq: "M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48z",
  ollama:
    "M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48zm0 80c44.18 0 80 35.82 80 80v64c0 44.18-35.82 80-80 80s-80-35.82-80-80v-64c0-44.18 35.82-80 80-80z",
  "ollama-cloud":
    "M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48zm0 80c44.18 0 80 35.82 80 80v64c0 44.18-35.82 80-80 80s-80-35.82-80-80v-64c0-44.18 35.82-80 80-80z",
};

export function ProviderEditPage({ editId, onClose }: { editId?: string; onClose?: () => void }) {
  const { t } = useTranslation();
  const isEditing = !!editId;

  const providers = useProviderStore((s: ProviderStoreState) => s.providers);
  const addProvider = useProviderStore((s: ProviderStoreState) => s.addProvider);
  const updateProvider = useProviderStore((s: ProviderStoreState) => s.updateProvider);
  const getProviderById = useProviderStore((s: ProviderStoreState) => s.getProviderById);
  const fetchModels = useProviderStore((s: ProviderStoreState) => s.fetchModels);
  const testConnection = useProviderStore((s: ProviderStoreState) => s.testConnection);
  const addModelById = useProviderStore((s: ProviderStoreState) => s.addModelById);

  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    isEditing ? "__edit__" : null,
  );
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openai");
  const [apiFormat, setApiFormat] = useState<ApiFormat>("chat-completions");
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [providerEnabled, setProviderEnabled] = useState(true);

  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pulling, setPulling] = useState(false);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(editId ?? null);
  const [testPulledModels, setTestPulledModels] = useState<Array<{ id: string; object: string }>>(
    [],
  );
  const [disabledTestModels, setDisabledTestModels] = useState<Set<string>>(new Set());

  // Load existing provider data
  useEffect(() => {
    if (editId) {
      const provider = getProviderById(editId);
      if (provider) {
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey(provider.apiKey);
        setProviderType("openai");
        setApiFormat(provider.apiFormat ?? "chat-completions");
        setCustomHeaders(provider.customHeaders ?? []);
        setProviderEnabled(provider.enabled !== false);
        setConnected(provider.status === "connected" || (provider as any).status === "active");
      }
    }
  }, [editId]);

  const applyPreset = (key: string) => {
    const preset = PROVIDER_PRESETS[key];
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
      setProviderType(preset.type);
      setSelectedPreset(key);
      setConnected(null);
    }
  };

  const handleConnect = useCallback(async () => {
    if (!name.trim() || !baseUrl.trim()) return;

    // Check duplicate name for new providers (1:1 RN)
    if (!isEditing && !savedProviderId) {
      const duplicate = providers.find(
        (p: Provider) => p.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        appAlert(t("providerEdit.duplicateName"));
        return;
      }
    }

    setTesting(true);
    setConnected(null);

    try {
      if (savedProviderId) {
        // Update existing
        updateProvider(savedProviderId, {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          type: providerType,
          apiFormat,
          customHeaders,
          enabled: providerEnabled,
        });
        const ok = await testConnection(savedProviderId);
        setConnected(ok);
        if (ok) {
          setPulling(true);
          await fetchModels(savedProviderId);
          setPulling(false);
        } else {
          appAlert(t("providerEdit.connectionFailed", { defaultValue: "Connection failed" }));
        }
      } else {
        // New provider: test connection WITHOUT saving (1:1 RN)
        const url = baseUrl.trim().replace(/\/+$/, "");

        const headers = buildProviderHeadersFromRaw({ apiKey: apiKey.trim(), customHeaders });

        const res = await appFetch(`${url}/models`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });

        const ok = res.ok;
        setConnected(ok);

        if (!ok) {
          const errText = await res.text().catch(() => "");
          appAlert(
            t("providerEdit.connectionFailed", { defaultValue: "Connection failed" }) +
              `\n${res.status}: ${errText.slice(0, 200)}`,
          );
        }

        if (ok) {
          // Auto-save provider on successful connect (no separate Save needed)
          const newId = generateId();
          const newProvider: Provider = {
            id: newId,
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            type: providerType,
            apiFormat,
            customHeaders,
            enabled: providerEnabled,
            apiVersion: undefined,
            status: "connected",
            createdAt: new Date().toISOString(),
          };
          addProvider(newProvider);
          setSavedProviderId(newId);

          setPulling(true);
          try {
            const json = await res.json();
            const modelList: any[] = json.data ?? json ?? [];
            // Add all models to the saved provider
            for (const m of modelList) {
              addModelById(newId, m.id);
            }
            setTestPulledModels([]); // No longer needed — already saved
          } catch {
            setTestPulledModels([]);
          }
          setPulling(false);
        } else {
          setTestPulledModels([]);
        }
      }
    } catch (err: any) {
      setConnected(false);
      setTestPulledModels([]);
      const msg = err?.message || String(err);
      console.error("[ProviderEdit] connection error:", err);
      appAlert(
        t("providerEdit.connectionFailed", { defaultValue: "Connection failed" }) +
          `\n${msg.slice(0, 300)}`,
      );
    } finally {
      setTesting(false);
    }
  }, [
    name,
    baseUrl,
    apiKey,
    providerType,
    apiFormat,
    customHeaders,
    providerEnabled,
    isEditing,
    savedProviderId,
    providers,
    testConnection,
    fetchModels,
    updateProvider,
    addProvider,
    addModelById,
    t,
  ]);

  const handleSave = useCallback(() => {
    const providerData = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      type: providerType,
      apiFormat,
      customHeaders,
      enabled: providerEnabled,
    };

    if (!providerData.name || !providerData.baseUrl) return;

    if (savedProviderId) {
      updateProvider(savedProviderId, providerData);
    } else {
      const id = generateId();
      const provider: Provider = {
        id,
        ...providerData,
        apiVersion: undefined,
        status: "connected" as const,
        createdAt: new Date().toISOString(),
      };
      addProvider(provider);
      setSavedProviderId(provider.id);

      // Persist only enabled pulled models
      const modelsToSave = testPulledModels.filter((m) => !disabledTestModels.has(m.id));
      for (const m of modelsToSave) {
        addModelById(provider.id, m.id);
      }
      if (testPulledModels.length > 0) setTestPulledModels([]);
    }

    onClose?.();
  }, [
    name,
    baseUrl,
    apiKey,
    providerType,
    apiFormat,
    customHeaders,
    providerEnabled,
    savedProviderId,
    updateProvider,
    addProvider,
    testPulledModels,
    disabledTestModels,
    addModelById,
    onClose,
  ]);

  const handleRefresh = async () => {
    if (!savedProviderId) return;
    setPulling(true);
    try {
      await fetchModels(savedProviderId);
    } catch {
      /* ignore */
    } finally {
      setPulling(false);
    }
  };

  const isCustom = selectedPreset === "__custom__";
  const showForm = isEditing || selectedPreset;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
        {/* ── Step 1: Choose Provider (new only) ── */}
        {!isEditing && !selectedPreset && (
          <>
            <p className="text-foreground mb-4 text-[15px] font-semibold">
              {t("providerEdit.quickSelect")}
            </p>

            {/* OpenAI Compatible — hero card */}
            <button
              onClick={() => {
                setSelectedPreset("__custom__");
                setProviderType("openai");
              }}
              className="mb-3 flex w-full items-center rounded-2xl px-5 py-4 active:opacity-80"
              style={{
                backgroundColor: "color-mix(in srgb, var(--primary) 5%, var(--card))",
                border: "2px solid color-mix(in srgb, var(--primary) 30%, transparent)",
              }}
            >
              <div
                className="mr-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}
              >
                <IoLinkOutline size={24} color="var(--primary)" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-foreground text-[16px] font-bold">
                  {t("providerEdit.openaiCompatible")}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[13px]">
                  {t("providerEdit.openaiCompatibleHint")}
                </p>
              </div>
              <IoChevronForward size={20} color="var(--primary)" style={{ opacity: 0.5 }} />
            </button>

            <p className="text-muted-foreground/60 mt-2 mb-2 px-1 text-[13px]">
              {t("providerEdit.directApi")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className="flex flex-col items-center rounded-2xl px-3 py-4 active:opacity-80"
                  style={{ backgroundColor: "var(--card)" }}
                >
                  <svg width="24" height="24" viewBox="0 0 512 512" fill="var(--primary)">
                    <path d={PRESET_SVG[key] ?? ""} />
                  </svg>
                  <span className="text-foreground mt-1.5 text-[14px] font-semibold">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2: Configuration Form ── */}
        {showForm && (
          <>
            {/* Preset summary card (1:1 RN) */}
            {selectedPreset && !isCustom && !isEditing && (
              <button
                onClick={() => {
                  setSelectedPreset(null);
                  setConnected(null);
                }}
                className="mb-4 flex w-full items-center rounded-2xl px-4 py-3 active:opacity-80"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 512 512" fill="var(--primary)">
                  <path d={PRESET_SVG[selectedPreset] ?? ""} />
                </svg>
                <div className="ml-3 flex-1 text-left">
                  <p className="text-foreground text-[16px] font-semibold">{name}</p>
                  <p className="text-muted-foreground text-[12px]">{baseUrl}</p>
                </div>
                <IoCaretDown size={18} color="var(--muted-foreground)" />
              </button>
            )}

            <ProviderConfigForm
              name={name}
              onNameChange={setName}
              baseUrl={baseUrl}
              onBaseUrlChange={setBaseUrl}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              providerType={providerType}
              onProviderTypeChange={setProviderType}
              apiFormat={apiFormat}
              onApiFormatChange={setApiFormat}
              customHeaders={customHeaders}
              onCustomHeadersChange={setCustomHeaders}
              providerEnabled={providerEnabled}
              onProviderEnabledChange={setProviderEnabled}
              showBaseFields={isCustom || isEditing}
            />

            {/* Action Buttons Row (1:1 RN: flex-row gap-3) */}
            <div className="mt-4 flex gap-3">
              <button
                className="flex flex-1 items-center justify-center rounded-xl py-3.5 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
                disabled={testing || pulling || !name.trim() || !baseUrl.trim()}
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
                {testing || pulling ? (
                  <span>
                    {pulling ? t("providerEdit.fetchingModels") : t("providerEdit.connecting")}
                  </span>
                ) : connected === true ? (
                  <span className="flex items-center gap-1.5">
                    <IoCheckmarkCircle size={20} /> {t("providerEdit.connected")}
                  </span>
                ) : connected === false ? (
                  <span>{t("providerEdit.retryConnection")}</span>
                ) : (
                  <span>{t("providerEdit.connectAndFetch")}</span>
                )}
              </button>
              {connected && (
                <button
                  onClick={handleSave}
                  className="flex items-center justify-center gap-1 rounded-xl px-6 py-3.5 text-[15px] font-semibold text-white active:opacity-80"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  <IoCheckmarkCircle size={20} />
                  {t("providerEdit.save")}
                </button>
              )}
            </div>

            {/* ── Step 3: Models (existing provider) ── */}
            {savedProviderId && (
              <ProviderModelList
                providerId={savedProviderId}
                pulling={pulling}
                onRefresh={handleRefresh}
              />
            )}
          </>
        )}

        {/* ── Step 3: Models (new provider, not yet saved) ── */}
        {connected && !savedProviderId && testPulledModels.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-muted-foreground text-[13px] font-normal tracking-tight uppercase">
                {t("providerEdit.pulledModels", { count: testPulledModels.length })}
              </span>
              <button
                onClick={() => {
                  const allSelected = testPulledModels.every((m) => !disabledTestModels.has(m.id));
                  if (allSelected) {
                    setDisabledTestModels(new Set(testPulledModels.map((m) => m.id)));
                  } else {
                    setDisabledTestModels(new Set());
                  }
                }}
                className="text-[13px] font-medium active:opacity-60"
                style={{ color: "var(--primary)" }}
              >
                {testPulledModels.every((m) => !disabledTestModels.has(m.id))
                  ? t("providerEdit.deselectAll")
                  : t("providerEdit.selectAll")}
              </button>
            </div>
            <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
              {testPulledModels.map((m: { id: string; object: string }, idx: number) => {
                const enabled = !disabledTestModels.has(m.id);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom:
                        idx < testPulledModels.length - 1 ? "0.5px solid var(--border)" : "none",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[15px] font-semibold ${enabled ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {m.id}
                      </p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() =>
                          setDisabledTestModels((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                        className="peer sr-only"
                      />
                      <div className="peer-checked:bg-primary bg-muted-foreground/30 h-6 w-11 rounded-full after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Security note */}
        <div className="flex items-center justify-center gap-1.5 px-6 pt-10 pb-8">
          <IoLockClosed size={12} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
          <span className="text-muted-foreground/40 text-[11px]">
            {t("providerEdit.encryption")}
          </span>
        </div>
      </div>
    </div>
  );
}

