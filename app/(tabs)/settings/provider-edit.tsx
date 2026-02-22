import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { PROVIDER_PRESETS, PROVIDER_TYPE_OPTIONS } from "../../../src/constants";
import type { Model, ProviderType, CustomHeader } from "../../../src/types";

export default function ProviderEditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!editId;

  const addProviderWithTest = useProviderStore((s) => s.addProviderWithTest);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const getModelsByProvider = useProviderStore((s) => s.getModelsByProvider);
  const testConnection = useProviderStore((s) => s.testConnection);
  const fetchModels = useProviderStore((s) => s.fetchModels);
  const toggleModel = useProviderStore((s) => s.toggleModel);
  const setProviderModelsEnabled = useProviderStore((s) => s.setProviderModelsEnabled);
  const probeModelCapabilities = useProviderStore((s) => s.probeModelCapabilities);
  const allModels = useProviderStore((s) => s.models);
  const addModelToStore = useProviderStore((s) => s.addModel);
  const [probingModelId, setProbingModelId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openai");
  const [apiVersion, setApiVersion] = useState("");
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [providerEnabled, setProviderEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pulledModels, setPulledModels] = useState<Model[]>([]);
  const [pulling, setPulling] = useState(false);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const displayModels = savedProviderId
    ? allModels.filter((m) => m.providerId === savedProviderId)
    : pulledModels;

  useEffect(() => {
    if (editId) {
      const provider = getProviderById(editId);
      if (provider) {
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey(provider.apiKey);
        setProviderType(provider.type);
        setApiVersion(provider.apiVersion ?? "");
        setCustomHeaders(provider.customHeaders ?? []);
        setProviderEnabled(provider.enabled !== false);
        setSavedProviderId(provider.id);
        setConnected(provider.status === "connected");
        setPulledModels(getModelsByProvider(provider.id));
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

  const selectCustom = () => {
    setSelectedPreset("__custom__");
    setName("");
    setBaseUrl("");
    setProviderType("openai");
    setConnected(null);
  };

  const handleConnect = async () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      Alert.alert(t("common.error"), t("providerEdit.allFieldsRequired"));
      return;
    }

    setTesting(true);
    setConnected(null);

    const providerData = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      type: providerType,
      apiVersion: apiVersion.trim() || undefined,
      customHeaders,
      enabled: providerEnabled,
    };

    let providerId = savedProviderId;
    let ok = false;

    if (isEditing && providerId) {
      // For editing, update then test
      updateProvider(providerId, providerData);
      ok = await testConnection(providerId);
    } else {
      // For new provider, test before saving
      const result = await addProviderWithTest(providerData);
      ok = result.success;
      if (result.provider) {
        providerId = result.provider.id;
        setSavedProviderId(providerId);
      }
    }

    setConnected(ok);

    if (ok && providerId) {
      // Auto-fetch models after successful connection
      setPulling(true);
      try {
        const models = await fetchModels(providerId);
        setPulledModels(models);
      } catch { /* ignore fetch errors */ }
      setPulling(false);
    } else {
      Alert.alert(t("providerEdit.connectionFailed"), t("providerEdit.connectionFailedHint"));
    }
    setTesting(false);
  };

  const handleRefreshModels = async () => {
    if (!savedProviderId) return;
    setPulling(true);
    try {
      const models = await fetchModels(savedProviderId);
      setPulledModels(models);
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : t("providerEdit.fetchFailed"));
    } finally {
      setPulling(false);
    }
  };

  const handleSave = () => {
    if (savedProviderId) {
      updateProvider(savedProviderId, {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        type: providerType,
        apiVersion: apiVersion.trim() || undefined,
        customHeaders,
        enabled: providerEnabled,
      });
    }
    router.back();
  };

  const handleAddModel = () => {
    const mid = newModelId.trim();
    if (!mid || !savedProviderId) return;
    addModelToStore(savedProviderId, mid);
    setNewModelId("");
  };

  const addCustomHeader = () => {
    setCustomHeaders((prev) => [...prev, { name: "", value: "" }]);
  };

  const updateCustomHeader = (index: number, field: "name" | "value", val: string) => {
    setCustomHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  };

  const removeCustomHeader = (index: number) => {
    setCustomHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const filteredModels = modelSearch
    ? displayModels.filter(
        (m) =>
          m.displayName.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.modelId.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : displayModels;

  const PRESET_ICONS: Record<string, string> = {
    deepseek: "flash-outline",
    openai: "cube-outline",
    anthropic: "diamond-outline",
    google: "logo-google",
    azure: "cloud-outline",
    openrouter: "globe-outline",
    groq: "speedometer-outline",
    ollama: "server-outline",
  };

  const isCustom = selectedPreset === "__custom__";
  const showForm = isEditing || selectedPreset;

  return (
    <ScrollView className="flex-1 bg-bg-secondary" keyboardShouldPersistTaps="handled">
      {/* ── Step 1: Choose Provider ── */}
      {!isEditing && !selectedPreset && (
        <View className="px-4 pt-6">
          <Text className="mb-4 px-1 text-[15px] font-semibold text-slate-900">
            {t("providerEdit.quickSelect")}
          </Text>
          {/* OpenAI Compatible — hero card */}
          <Pressable
            onPress={selectCustom}
            className="mb-3 flex-row items-center rounded-2xl border-2 border-primary/30 bg-primary/5 px-5 py-4 active:opacity-80"
          >
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Ionicons name="link-outline" size={26} color="#007AFF" />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-bold text-slate-900">{t("providerEdit.openaiCompatible")}</Text>
              <Text className="mt-0.5 text-[13px] text-slate-500">{t("providerEdit.openaiCompatibleHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#007AFF" />
          </Pressable>

          <Text className="mb-2 mt-2 px-1 text-[13px] text-slate-400">{t("providerEdit.directApi")}</Text>
          <View className="flex-row flex-wrap gap-3">
            {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
              <Pressable
                key={key}
                onPress={() => applyPreset(key)}
                className="w-[47%] items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 active:opacity-80"
              >
                <Ionicons name={(PRESET_ICONS[key] ?? "ellipse-outline") as any} size={24} color="#007AFF" />
                <Text className="mt-1.5 text-[14px] font-semibold text-slate-800">{preset.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Step 2: Configuration ── */}
      {showForm && (
        <View className="px-4 pt-6">
          {/* Provider summary when using preset */}
          {selectedPreset && !isCustom && (
            <Pressable
              onPress={() => { setSelectedPreset(null); setConnected(null); }}
              className="mb-4 flex-row items-center rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 active:opacity-80"
            >
              <Ionicons
                name={(PRESET_ICONS[selectedPreset] ?? "ellipse-outline") as any}
                size={24}
                color="#007AFF"
              />
              <View className="ml-3 flex-1">
                <Text className="text-[16px] font-semibold text-slate-900">{name}</Text>
                <Text className="text-[12px] text-slate-500">{baseUrl}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#94a3b8" />
            </Pressable>
          )}

          {/* Full form for Custom or Editing */}
          {(isCustom || isEditing) && (
            <View className="overflow-hidden rounded-xl border border-slate-200 bg-white mb-4">
              <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
                <Text className="w-24 text-[15px] text-slate-900">{t("providerEdit.name")}</Text>
                <TextInput
                  className="flex-1 bg-transparent text-[16px] text-slate-600"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. OpenRouter"
                  placeholderTextColor="#cbd5e1"
                />
              </View>
              <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
                <Text className="w-24 text-[15px] text-slate-900">{t("providerEdit.baseUrl")}</Text>
                <TextInput
                  className="flex-1 bg-transparent text-[16px] text-slate-600"
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor="#cbd5e1"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              <View className="flex-row items-center px-4 py-3.5">
                <Text className="w-24 text-[15px] text-slate-900">{t("providerEdit.type")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                  <View className="flex-row gap-2">
                    {PROVIDER_TYPE_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => setProviderType(opt.value)}
                        className={`rounded-full border px-3 py-1.5 ${
                          providerType === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <Text className={`text-[13px] font-medium ${providerType === opt.value ? "text-primary" : "text-slate-500"}`}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {/* API Key */}
          <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <View className="flex-row items-center px-4 py-3.5">
              <Ionicons name="key-outline" size={18} color="#94a3b8" style={{ marginRight: 12 }} />
              <TextInput
                className="flex-1 bg-transparent text-[16px] text-slate-600"
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="API Key"
                placeholderTextColor="#cbd5e1"
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowApiKey(!showApiKey)} className="ml-2 p-1 active:opacity-60">
                <Ionicons name={showApiKey ? "eye-off" : "eye"} size={20} color="#94a3b8" />
              </Pressable>
            </View>
          </View>

          {/* Advanced Settings Toggle */}
          <Pressable
            onPress={() => setShowAdvanced(!showAdvanced)}
            className="mt-4 flex-row items-center justify-between px-1 py-2"
          >
            <Text className="text-[13px] font-medium text-slate-500">{t("providerEdit.advancedSettings")}</Text>
            <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color="#94a3b8" />
          </Pressable>

          {showAdvanced && (
            <View className="overflow-hidden rounded-xl border border-slate-200 bg-white mb-4">
              {providerType === "azure-openai" && (
                <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
                  <Text className="w-24 text-[15px] text-slate-900">API Ver.</Text>
                  <TextInput
                    className="flex-1 bg-transparent text-[16px] text-slate-600"
                    value={apiVersion}
                    onChangeText={setApiVersion}
                    placeholder="2024-02-01"
                    placeholderTextColor="#cbd5e1"
                    autoCapitalize="none"
                  />
                </View>
              )}
              <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5">
                <Text className="text-[15px] text-slate-900">{t("providerEdit.enabled")}</Text>
                <Switch
                  value={providerEnabled}
                  onValueChange={setProviderEnabled}
                  trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
                  thumbColor="#fff"
                  ios_backgroundColor="#e5e7eb"
                />
              </View>
              {/* Custom Headers */}
              <View className="px-4 py-3.5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[14px] text-slate-700">{t("providerEdit.customHeaders")}</Text>
                  <Pressable onPress={addCustomHeader} className="flex-row items-center active:opacity-60">
                    <Ionicons name="add-circle-outline" size={16} color="#007AFF" />
                    <Text className="ml-1 text-[13px] font-medium text-primary">{t("common.add")}</Text>
                  </Pressable>
                </View>
                {customHeaders.map((h, idx) => (
                  <View key={idx} className="mb-2 flex-row items-center gap-2">
                    <TextInput
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px]"
                      value={h.name}
                      onChangeText={(v) => updateCustomHeader(idx, "name", v)}
                      placeholder="Header"
                      placeholderTextColor="#cbd5e1"
                      autoCapitalize="none"
                    />
                    <TextInput
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px]"
                      value={h.value}
                      onChangeText={(v) => updateCustomHeader(idx, "value", v)}
                      placeholder="Value"
                      placeholderTextColor="#cbd5e1"
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => removeCustomHeader(idx)} className="p-1 active:opacity-60">
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Action Buttons Row ── */}
          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={handleConnect}
              disabled={testing || !apiKey.trim()}
              className={`flex-1 flex-row items-center justify-center rounded-xl py-3.5 ${
                testing ? "bg-slate-300" : connected === true ? "bg-accent-green" : connected === false ? "bg-error" : "bg-primary"
              }`}
            >
              {testing ? (
                <>
                  <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                  <Text className="text-[15px] font-semibold text-white">{pulling ? t("providerEdit.fetchingModels") : t("providerEdit.connecting")}</Text>
                </>
              ) : connected === true ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text className="text-[15px] font-semibold text-white">{t("providerEdit.connected")}</Text>
                </>
              ) : connected === false ? (
                <Text className="text-[15px] font-semibold text-white">{t("providerEdit.retryConnection")}</Text>
              ) : (
                <Text className="text-[15px] font-semibold text-white">{t("providerEdit.connectAndFetch")}</Text>
              )}
            </Pressable>
            {connected && (
              <Pressable
                onPress={handleSave}
                className="flex-row items-center justify-center rounded-xl bg-primary px-6 py-3.5"
              >
                <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 4 }} />
                <Text className="text-[15px] font-semibold text-white">{t("providerEdit.save")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ── Step 3: Models ── */}
      {connected && (
        <View className="px-4 pt-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-normal uppercase tracking-tight text-slate-500">
              {t("providerEdit.pulledModels", { count: displayModels.length })}
            </Text>
            <View className="flex-row items-center gap-4">
              {savedProviderId && displayModels.length > 0 && (
                <Pressable onPress={() => {
                  const allEnabled = displayModels.every((m) => m.enabled);
                  setProviderModelsEnabled(savedProviderId, !allEnabled);
                }} className="active:opacity-60">
                  <Text className="text-[13px] font-medium text-primary">
                    {displayModels.every((m) => m.enabled) ? t("providerEdit.deselectAll") : t("providerEdit.selectAll")}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={handleRefreshModels} disabled={pulling} className="flex-row items-center active:opacity-60">
                {pulling ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color="#007AFF" />
                    <Text className="ml-1 text-[13px] font-medium text-primary">{t("providerEdit.refresh")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Model Search */}
          <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              className="flex-1 text-[14px] text-slate-700"
              value={modelSearch}
              onChangeText={setModelSearch}
              placeholder={t("providerEdit.searchModels")}
              placeholderTextColor="#cbd5e1"
              autoCapitalize="none"
            />
            {modelSearch ? (
              <Pressable onPress={() => setModelSearch("")} className="active:opacity-60">
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </Pressable>
            ) : null}
          </View>

          {/* Manual Add Model */}
          {savedProviderId && (
            <View className="mt-2 flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px]"
                value={newModelId}
                onChangeText={setNewModelId}
                placeholder={t("providerEdit.addModelPlaceholder")}
                placeholderTextColor="#cbd5e1"
                autoCapitalize="none"
              />
              <Pressable
                onPress={handleAddModel}
                disabled={!newModelId.trim()}
                className={`rounded-xl px-4 py-2.5 ${newModelId.trim() ? "bg-primary" : "bg-slate-200"}`}
              >
                <Text className={`text-[14px] font-medium ${newModelId.trim() ? "text-white" : "text-slate-400"}`}>
                  {t("common.add")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Model List */}
          <View className="mt-3 gap-2">
            {filteredModels.map((m) => (
              <View key={m.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className={`text-[15px] font-semibold ${m.enabled ? "text-slate-900" : "text-slate-400"}`} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Text className="text-[12px] text-slate-400" numberOfLines={1}>{m.modelId}</Text>
                  </View>
                  <Switch
                    value={m.enabled}
                    onValueChange={() => toggleModel(m.id)}
                    trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
                    thumbColor="#fff"
                    ios_backgroundColor="#e5e7eb"
                  />
                </View>
                <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                  {[
                    { key: "vision", icon: "eye-outline", on: m.capabilities.vision },
                    { key: "tools", icon: "construct-outline", on: m.capabilities.toolCall },
                    { key: "reasoning", icon: "bulb-outline", on: m.capabilities.reasoning },
                  ].map((cap) => (
                    <View key={cap.key} className={`flex-row items-center rounded-md bg-slate-50 px-2 py-0.5 ${!cap.on ? "opacity-30" : ""}`}>
                      <Ionicons name={cap.icon as any} size={12} color={cap.on ? "#007AFF" : "#94a3b8"} style={{ marginRight: 3 }} />
                      <Text className="text-[11px] text-slate-600">{t(`providerEdit.${cap.key}`)}</Text>
                    </View>
                  ))}
                  <Pressable
                    onPress={async () => {
                      setProbingModelId(m.id);
                      try { await probeModelCapabilities(m.id); }
                      catch (err) { Alert.alert(t("common.error"), err instanceof Error ? err.message : "Probe failed"); }
                      finally { setProbingModelId(null); }
                    }}
                    disabled={probingModelId === m.id}
                    className="flex-row items-center rounded-md bg-blue-50 px-2 py-0.5 active:opacity-60"
                  >
                    {probingModelId === m.id ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <>
                        <Ionicons name="pulse-outline" size={12} color="#007AFF" style={{ marginRight: 3 }} />
                        <Text className="text-[11px] font-medium text-primary">{t("providerEdit.probe")}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Security note */}
      <View className="items-center px-6 pt-10 pb-8">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Ionicons name="lock-closed" size={12} color="#cbd5e1" />
          <Text className="text-[11px] text-slate-300">{t("providerEdit.encryption")}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
