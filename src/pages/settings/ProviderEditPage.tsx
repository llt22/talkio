/**
 * ProviderEditPage — Full-screen provider add/edit (1:1 RN original).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  IoLinkOutline,
  IoChevronForward,
  IoKeyOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCaretDown,
  IoCaretUp,
  IoAdd,
  IoCloseCircle,
  IoRefreshOutline,
  IoSearchOutline,
  IoLockClosed,
  IoCheckmarkCircle,
  IoConstructOutline,
  IoBulbOutline,
  IoPulseOutline,
} from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import type { Provider, ProviderType, CustomHeader, Model } from "../../types";
import { generateId } from "../../lib/id";
import { buildProviderHeadersFromRaw } from "../../services/provider-headers";
import { appFetch } from "../../lib/http";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";

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
  const getModelsByProvider = useProviderStore((s: ProviderStoreState) => s.getModelsByProvider);
  const fetchModels = useProviderStore((s: ProviderStoreState) => s.fetchModels);
  const testConnection = useProviderStore((s: ProviderStoreState) => s.testConnection);
  const updateModel = useProviderStore((s: ProviderStoreState) => s.updateModel);
  const toggleModel = useProviderStore((s: ProviderStoreState) => s.toggleModel);
  const setProviderModelsEnabled = useProviderStore(
    (s: ProviderStoreState) => s.setProviderModelsEnabled,
  );
  const addModelById = useProviderStore((s: ProviderStoreState) => s.addModelById);
  const allModels = useProviderStore((s: ProviderStoreState) => s.models);
  const probeModelCapabilities = useProviderStore(
    (s: ProviderStoreState) => s.probeModelCapabilities,
  );

  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    isEditing ? "__edit__" : null,
  );
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openai");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [providerEnabled, setProviderEnabled] = useState(true);

  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pulling, setPulling] = useState(false);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(editId ?? null);
  const [testPulledModels, setTestPulledModels] = useState<Array<{ id: string; object: string }>>(
    [],
  );
  const [modelSearch, setModelSearch] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [probingModelIds, setProbingModelIds] = useState<Set<string>>(new Set());
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

  const displayModels = savedProviderId ? getModelsByProvider(savedProviderId) : [];

  const filteredModels = modelSearch
    ? displayModels.filter(
        (m: Model) =>
          m.displayName.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.modelId.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : displayModels;

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
        status: "connected",
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

            {/* Full form for Custom or Editing (1:1 RN) */}
            {(isCustom || isEditing) && (
              <div
                className="mb-4 overflow-hidden rounded-xl"
                style={{ backgroundColor: "var(--card)" }}
              >
                <FormRow label={t("providerEdit.name")}>
                  <input
                    className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. OpenRouter"
                  />
                </FormRow>
                <FormRow label={t("providerEdit.baseUrl")}>
                  <input
                    className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </FormRow>
                <FormRow label={t("providerEdit.type")} isLast>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDER_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setProviderType(opt.value)}
                        className="rounded-full px-3 py-1 text-[13px] font-medium transition-colors"
                        style={{
                          border: `1px solid ${providerType === opt.value ? "var(--primary)" : "var(--border)"}`,
                          backgroundColor:
                            providerType === opt.value
                              ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                              : "transparent",
                          color:
                            providerType === opt.value
                              ? "var(--primary)"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FormRow>
              </div>
            )}

            {/* API Key */}
            <div
              className="mb-4 overflow-hidden rounded-xl"
              style={{ backgroundColor: "var(--card)" }}
            >
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
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("providerEdit.apiKeyPlaceholder")}
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

            {/* Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mb-2 flex w-full items-center justify-between px-1 py-2"
            >
              <span className="text-muted-foreground text-[13px] font-medium">
                {t("providerEdit.advancedSettings")}
              </span>
              {showAdvanced ? (
                <IoCaretUp size={16} color="var(--muted-foreground)" style={{ opacity: 0.5 }} />
              ) : (
                <IoCaretDown size={16} color="var(--muted-foreground)" style={{ opacity: 0.5 }} />
              )}
            </button>

            {showAdvanced && (
              <div
                className="mb-4 overflow-hidden rounded-xl"
                style={{ backgroundColor: "var(--card)" }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3.5"
                  style={{ borderBottom: "0.5px solid var(--border)" }}
                >
                  <span className="text-foreground text-[15px]">{t("providerEdit.enabled")}</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={providerEnabled}
                      onChange={(e) => setProviderEnabled(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="peer-checked:bg-primary bg-muted-foreground/30 h-6 w-11 rounded-full after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                  </label>
                </div>
                <div className="px-4 py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-foreground text-[14px]">
                      {t("providerEdit.customHeaders")}
                    </span>
                    <button
                      onClick={() => setCustomHeaders([...customHeaders, { name: "", value: "" }])}
                      className="flex items-center gap-1 text-[13px] font-medium active:opacity-60"
                      style={{ color: "var(--primary)" }}
                    >
                      <IoAdd size={14} color="var(--primary)" />
                      {t("common.add")}
                    </button>
                  </div>
                  {customHeaders.map((h: CustomHeader, idx: number) => (
                    <div key={idx} className="mb-2 flex items-center gap-2">
                      <input
                        className="text-foreground flex-1 rounded-lg px-3 py-2 text-[14px] outline-none"
                        style={{ backgroundColor: "var(--muted)" }}
                        value={h.name}
                        onChange={(e) => {
                          const next = [...customHeaders];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setCustomHeaders(next);
                        }}
                        placeholder={t("providerEdit.customHeaderName")}
                      />
                      <input
                        className="text-foreground flex-1 rounded-lg px-3 py-2 text-[14px] outline-none"
                        style={{ backgroundColor: "var(--muted)" }}
                        value={h.value}
                        onChange={(e) => {
                          const next = [...customHeaders];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setCustomHeaders(next);
                        }}
                        placeholder={t("providerEdit.customHeaderValue")}
                      />
                      <button
                        onClick={() => setCustomHeaders(customHeaders.filter((_, i) => i !== idx))}
                        className="p-1 active:opacity-60"
                      >
                        <IoCloseCircle size={18} color="var(--destructive)" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              <div className="mt-6">
                <div className="flex items-center justify-between px-1">
                  <span className="text-muted-foreground text-[13px] font-normal tracking-tight uppercase">
                    {t("providerEdit.models")} ({filteredModels.length})
                  </span>
                  <div className="flex items-center gap-3">
                    {displayModels.length > 0 && (
                      <button
                        onClick={() => {
                          if (!savedProviderId) return;
                          const allEnabled = displayModels.every((m: Model) => m.enabled);
                          setProviderModelsEnabled(savedProviderId, !allEnabled);
                        }}
                        className="text-[13px] font-medium active:opacity-60"
                        style={{ color: "var(--primary)" }}
                      >
                        {displayModels.every((m: Model) => m.enabled)
                          ? t("providerEdit.deselectAll")
                          : t("providerEdit.selectAll")}
                      </button>
                    )}
                    <button
                      onClick={handleRefresh}
                      disabled={pulling}
                      className="flex items-center gap-1 text-[13px] font-medium active:opacity-60"
                      style={{ color: "var(--primary)" }}
                    >
                      <IoRefreshOutline size={14} color="var(--primary)" />
                      {t("providerEdit.refresh")}
                    </button>
                  </div>
                </div>

                {/* Model Search */}
                <div
                  className="mt-3 flex items-center rounded-xl px-3 py-2"
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

                {/* Manual Add Model */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="text-foreground flex-1 rounded-xl px-3 py-2.5 text-[14px] outline-none"
                    style={{ backgroundColor: "var(--card)" }}
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder={t("providerEdit.addModelPlaceholder")}
                  />
                  <button
                    onClick={() => {
                      const mid = newModelId.trim();
                      if (!mid || !savedProviderId) return;
                      addModelById(savedProviderId, mid);
                      setNewModelId("");
                    }}
                    disabled={!newModelId.trim()}
                    className="rounded-xl px-4 py-2.5 text-[14px] font-medium active:opacity-80"
                    style={{
                      backgroundColor: newModelId.trim() ? "var(--primary)" : "var(--muted)",
                      color: newModelId.trim() ? "white" : "var(--muted-foreground)",
                    }}
                  >
                    {t("common.add")}
                  </button>
                </div>

                {/* Model List — 1:1 RN: separate rounded cards */}
                <div className="mt-3 flex flex-col gap-2">
                  {filteredModels.map((m: Model) => (
                    <div
                      key={m.id}
                      className="rounded-xl px-4 py-3"
                      style={{ backgroundColor: "var(--card)" }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="mr-3 min-w-0 flex-1">
                          <p
                            className={`truncate text-[15px] font-semibold ${m.enabled ? "text-foreground" : "text-muted-foreground/40"}`}
                          >
                            {m.displayName}
                          </p>
                          <p className="text-muted-foreground truncate text-[12px]">{m.modelId}</p>
                        </div>
                        <label className="relative inline-flex flex-shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={() => toggleModel(m.id)}
                            className="peer sr-only"
                          />
                          <div className="peer-checked:bg-primary bg-muted-foreground/30 h-6 w-11 rounded-full after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {[
                          {
                            key: "vision",
                            label: t("providerEdit.vision"),
                            on: m.capabilities?.vision,
                            icon: <IoEyeOutline size={12} />,
                          },
                          {
                            key: "tools",
                            label: t("providerEdit.tools"),
                            on: m.capabilities?.toolCall,
                            icon: <IoConstructOutline size={12} />,
                          },
                          {
                            key: "reasoning",
                            label: t("providerEdit.reasoning"),
                            on: m.capabilities?.reasoning,
                            icon: <IoBulbOutline size={12} />,
                          },
                        ].map((cap) => (
                          <span
                            key={cap.key}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${!cap.on ? "opacity-30" : ""}`}
                            style={{
                              backgroundColor: "var(--muted)",
                              color: cap.on ? "var(--foreground)" : "var(--muted-foreground)",
                            }}
                          >
                            <span style={{ color: cap.on ? "var(--primary)" : "inherit" }}>
                              {cap.icon}
                            </span>
                            {cap.label}
                          </span>
                        ))}
                        <button
                          onClick={async () => {
                            setProbingModelIds((prev) => new Set(prev).add(m.id));
                            try {
                              await probeModelCapabilities(m.id);
                            } catch {
                              /* ignore */
                            } finally {
                              setProbingModelIds((prev) => {
                                const next = new Set(prev);
                                next.delete(m.id);
                                return next;
                              });
                            }
                          }}
                          disabled={probingModelIds.has(m.id)}
                          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60 disabled:opacity-40"
                          style={{ backgroundColor: "var(--muted)", color: "var(--primary)" }}
                        >
                          {probingModelIds.has(m.id) ? (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                          ) : (
                            <IoPulseOutline size={12} />
                          )}
                          {t("providerEdit.probe")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

// ── Helper: Form Row (1:1 RN original) ──

function FormRow({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className="flex items-center px-4 py-3.5"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <span className="text-foreground w-24 flex-shrink-0 text-[15px]">{label}</span>
      {children}
    </div>
  );
}
