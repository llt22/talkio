/**
 * ProviderEditPage — Full-screen provider add/edit (1:1 RN original).
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IoLockClosed, IoCheckmarkCircle } from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import type { Provider, ProviderType, ApiFormat, CustomHeader } from "../../types";
import { generateId } from "../../lib/id";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";
import { PROVIDER_PROFILES } from "../../services/provider-profiles/registry";
import { ProviderModelList } from "./ProviderModelList";
import { ProviderConfigForm } from "./ProviderConfigForm";

type ProviderStoreState = ReturnType<typeof useProviderStore.getState>;

type ProviderPreset = {
  name: string;
  baseUrl: string;
  type: ProviderType;
  apiFormat?: ApiFormat;
  profileId?: string;
  apiVersion?: string;
};

const PROFILE_TO_TYPE: Record<string, ProviderType> = {
  anthropic: "anthropic",
  gemini: "gemini",
  "azure-openai": "azure-openai",
};

function profileType(id: string): ProviderType {
  return PROFILE_TO_TYPE[id] ?? "openai";
}

/** Data-driven presets — registry entries plus a couple of UI conveniences. */
const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  ...Object.fromEntries(
    PROVIDER_PROFILES.map((p) => [
      p.id,
      {
        name: p.name,
        baseUrl: p.endpoint.baseUrl,
        type: profileType(p.id),
        apiFormat: p.protocol,
        profileId: p.id,
        apiVersion: p.endpoint.apiVersion,
      },
    ]),
  ),
  "ollama-cloud": {
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    type: "openai",
    apiFormat: "chat-completions",
  },
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
    isEditing ? null : "__openai__",
  );
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openai");
  const [apiFormat, setApiFormat] = useState<ApiFormat>("chat-completions");
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [apiVersion, setApiVersion] = useState<string | undefined>(undefined);
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
        setProviderType(provider.type);
        setApiFormat(provider.apiFormat ?? "chat-completions");
        setCustomHeaders(provider.customHeaders ?? []);
        setProviderEnabled(provider.enabled !== false);
        setApiVersion(provider.apiVersion);
        setSelectedPreset(provider.profileId ?? null);
        setConnected(provider.status === "connected");
      }
    }
  }, [editId]);

  const applyPreset = (key: string) => {
    const preset = PROVIDER_PRESETS[key];
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
      setProviderType(preset.type);
      setApiFormat(preset.apiFormat ?? "chat-completions");
      setApiVersion(preset.apiVersion);
      setSelectedPreset(key);
      setConnected(null);
    }
  };

  const handleConnect = useCallback(async () => {
    if (!name.trim() || !baseUrl.trim()) return;

    if (!isEditing && !savedProviderId) {
      const duplicate = providers.find(
        (provider: Provider) => provider.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        appAlert(t("providerEdit.duplicateName"));
        return;
      }
    }

    setTesting(true);
    setConnected(null);
    try {
      const profileId = PROVIDER_PRESETS[selectedPreset ?? ""]?.profileId;
      const providerData = {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        type: providerType,
        apiFormat,
        profileId,
        apiVersion,
        customHeaders,
        enabled: providerEnabled,
      };

      let providerId = savedProviderId;
      if (providerId) {
        await updateProvider(providerId, providerData);
      } else {
        providerId = generateId();
        await addProvider({
          id: providerId,
          ...providerData,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        setSavedProviderId(providerId);
      }

      const ok = await testConnection(providerId);
      setConnected(ok);
      if (!ok) {
        appAlert(t("providerEdit.connectionFailed", { defaultValue: "Connection failed" }));
        return;
      }

      setPulling(true);
      const models = await fetchModels(providerId);
      setTestPulledModels([]);
      if (models.length === 0 && profileId !== "anthropic" && profileId !== "azure-openai") {
        toast.info(t("providerEdit.noModels", { defaultValue: "No models discovered" }));
      }
    } catch (error) {
      setConnected(false);
      setTestPulledModels([]);
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ProviderEdit] connection error:", error);
      appAlert(
        `${t("providerEdit.connectionFailed", { defaultValue: "Connection failed" })}\n${message.slice(0, 300)}`,
      );
    } finally {
      setPulling(false);
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
    apiVersion,
    selectedPreset,
    isEditing,
    savedProviderId,
    providers,
    testConnection,
    fetchModels,
    updateProvider,
    addProvider,
    t,
  ]);

  const handleSave = useCallback(async () => {
    const providerData = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      type: providerType,
      apiFormat,
      customHeaders,
      enabled: providerEnabled,
      profileId: PROVIDER_PRESETS[selectedPreset ?? ""]?.profileId,
      apiVersion,
    };

    if (!providerData.name || !providerData.baseUrl) return;

    try {
      if (savedProviderId) {
        await updateProvider(savedProviderId, providerData);
      } else {
        const id = generateId();
        const provider: Provider = {
          id,
          ...providerData,
          status: (connected ? "connected" : "pending") as Provider["status"],
          createdAt: new Date().toISOString(),
        };
        await addProvider(provider);
        setSavedProviderId(provider.id);
        // Persist only enabled pulled models
        const modelsToSave = testPulledModels.filter((m) => !disabledTestModels.has(m.id));
        for (const m of modelsToSave) addModelById(provider.id, m.id);
        if (testPulledModels.length > 0) setTestPulledModels([]);
      }
      onClose?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appAlert(message);
    }
  }, [
    name,
    baseUrl,
    apiKey,
    providerType,
    apiFormat,
    customHeaders,
    providerEnabled,
    selectedPreset,
    apiVersion,
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
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh models");
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
        {/* ── Provider type pills (new provider only) ── */}
        {!isEditing && (
          <div className="mb-4">
            {/* Row 1: API types */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(
                [
                  {
                    key: "__openai__",
                    label: t("providerEdit.openaiCompatible"),
                    format: "chat-completions" as ApiFormat,
                  },
                  {
                    key: "__responses__",
                    label: "OpenAI Responses",
                    format: "responses" as ApiFormat,
                  },
                  {
                    key: "anthropic",
                    label: "Anthropic",
                    format: "anthropic-messages" as ApiFormat,
                  },
                ] as const
              ).map((opt) => {
                const active = selectedPreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSelectedPreset(opt.key);
                      setApiFormat(opt.format);
                      if (opt.key === "anthropic") {
                        const p = PROVIDER_PRESETS.anthropic;
                        setName(p.name);
                        setBaseUrl(p.baseUrl);
                      } else {
                        setName("");
                        setBaseUrl("");
                      }
                      setConnected(null);
                    }}
                    className="rounded-full px-3 py-1 text-[13px] font-medium transition-colors"
                    style={{
                      border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                      backgroundColor: active
                        ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                        : "var(--card)",
                      color: active ? "var(--primary)" : "var(--muted-foreground)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {/* Row 2: Preset shortcuts */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PROVIDER_PRESETS)
                .filter(([key]) => key !== "anthropic")
                .map(([key, preset]) => {
                  const active = selectedPreset === key;
                  return (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      className="rounded-full px-3 py-1 text-[13px] font-medium transition-colors"
                      style={{
                        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                        backgroundColor: active
                          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                          : "var(--card)",
                        color: active ? "var(--primary)" : "var(--muted-foreground)",
                      }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Configuration Form ── */}
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
          showBaseFields={true}
          showApiFormatSelector={false}
        />

        {/* Action Buttons */}
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
          <button
            onClick={handleSave}
            disabled={testing || pulling || !name.trim() || !baseUrl.trim()}
            className="flex items-center justify-center gap-1 rounded-xl px-6 py-3.5 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <IoCheckmarkCircle size={20} />
            {t("providerEdit.save")}
          </button>
        </div>

        {/* ── Models (existing provider) ── */}
        {savedProviderId && (
          <ProviderModelList
            providerId={savedProviderId}
            pulling={pulling}
            onRefresh={handleRefresh}
          />
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
