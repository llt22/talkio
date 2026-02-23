import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useThemeColors } from "../../../src/hooks/useThemeColors";
import { PROVIDER_PRESETS, PROVIDER_TYPE_OPTIONS } from "../../../src/constants";
import { ApiClient } from "../../../src/services/api-client";
import type { Model, ProviderType, CustomHeader } from "../../../src/types";

export default function ProviderEditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!editId;

  const addProvider = useProviderStore((s) => s.addProvider);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const getModelsByProvider = useProviderStore((s) => s.getModelsByProvider);
  const providers = useProviderStore((s) => s.providers);
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
  const [testPulledModels, setTestPulledModels] = useState<Array<{ id: string; object: string }>>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const colors = useThemeColors();

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
    if (!name.trim() || !baseUrl.trim()) {
      Alert.alert(t("common.error"), t("providerEdit.allFieldsRequired"));
      return;
    }

    // Check duplicate name for new providers
    if (!isEditing && !savedProviderId) {
      const duplicate = providers.find(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        Alert.alert(t("common.error"), t("providerEdit.duplicateName"));
        return;
      }
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

    let ok = false;

    if (isEditing && savedProviderId) {
      // For editing, update then test
      updateProvider(savedProviderId, providerData);
      ok = await testConnection(savedProviderId);
      if (ok) {
        setPulling(true);
        try {
          const models = await fetchModels(savedProviderId);
          setPulledModels(models);
        } catch { /* ignore */ }
        setPulling(false);
      }
    } else {
      // For new provider: test connection WITHOUT saving
      const tempProvider = {
        ...providerData,
        id: "__temp__",
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
      const client = new ApiClient(tempProvider);
      ok = await client.testConnection();
      if (ok) {
        // Fetch model list (without saving)
        setPulling(true);
        try {
          const modelList = await client.listModels();
          setTestPulledModels(modelList);
        } catch { /* ignore */ }
        setPulling(false);
      }
    }

    setConnected(ok);
    if (!ok) {
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

  const handleSave = async () => {
    const providerData = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      type: providerType,
      apiVersion: apiVersion.trim() || undefined,
      customHeaders,
      enabled: providerEnabled,
    };

    if (savedProviderId) {
      // Editing existing provider
      updateProvider(savedProviderId, providerData);
    } else {
      // New provider: save now
      const provider = addProvider(providerData);
      updateProvider(provider.id, { status: "connected" });
      setSavedProviderId(provider.id);
      // Persist the pulled models
      if (testPulledModels.length > 0) {
        const addModel = useProviderStore.getState().addModel;
        for (const m of testPulledModels) {
          addModel(provider.id, m.id);
        }
        // Refresh displayed models
        setPulledModels(getModelsByProvider(provider.id));
        setTestPulledModels([]);
      }
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
          <Text className="mb-4 px-1 text-[15px] font-semibold text-text-main">
            {t("providerEdit.quickSelect")}
          </Text>
          {/* OpenAI Compatible — hero card */}
          <Pressable
            onPress={selectCustom}
            className="mb-3 flex-row items-center rounded-2xl border-2 border-primary/30 bg-primary/5 px-5 py-4 active:opacity-80"
          >
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Ionicons name="link-outline" size={26} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-bold text-text-main">{t("providerEdit.openaiCompatible")}</Text>
              <Text className="mt-0.5 text-[13px] text-text-muted">{t("providerEdit.openaiCompatibleHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accent} />
          </Pressable>

          <Text className="mb-2 mt-2 px-1 text-[13px] text-text-hint">{t("providerEdit.directApi")}</Text>
          <View className="flex-row flex-wrap gap-3">
            {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
              <Pressable
                key={key}
                onPress={() => applyPreset(key)}
                className="w-[47%] items-center rounded-2xl bg-bg-card px-3 py-4 active:opacity-80"
              >
                <Ionicons name={(PRESET_ICONS[key] ?? "ellipse-outline") as any} size={24} color={colors.accent} />
                <Text className="mt-1.5 text-[14px] font-semibold text-text-main">{preset.name}</Text>
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
                color={colors.accent}
              />
              <View className="ml-3 flex-1">
                <Text className="text-[16px] font-semibold text-text-main">{name}</Text>
                <Text className="text-[12px] text-text-muted">{baseUrl}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={colors.searchIcon} />
            </Pressable>
          )}

          {/* Full form for Custom or Editing */}
          {(isCustom || isEditing) && (
            <View className="overflow-hidden rounded-xl bg-bg-card mb-4">
              <View className="flex-row items-center border-b border-border-subtle px-4 py-3.5">
                <Text className="w-24 text-[15px] text-text-main">{t("providerEdit.name")}</Text>
                <TextInput
                  className="flex-1 bg-transparent text-[16px] text-text-muted"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. OpenRouter"
                  placeholderTextColor={colors.chevron}
                />
              </View>
              <View className="flex-row items-center border-b border-border-subtle px-4 py-3.5">
                <Text className="w-24 text-[15px] text-text-main">{t("providerEdit.baseUrl")}</Text>
                <TextInput
                  className="flex-1 bg-transparent text-[16px] text-text-muted"
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor={colors.chevron}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              <View className="flex-row items-center px-4 py-3.5">
                <Text className="w-24 text-[15px] text-text-main">{t("providerEdit.type")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                  <View className="flex-row gap-2">
                    {PROVIDER_TYPE_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => setProviderType(opt.value)}
                        className={`rounded-full border px-3 py-1.5 ${
                          providerType === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border-light bg-bg-card"
                        }`}
                      >
                        <Text className={`text-[13px] font-medium ${providerType === opt.value ? "text-primary" : "text-text-muted"}`}>
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
          <View className="overflow-hidden rounded-xl bg-bg-card">
            <View className="flex-row items-center px-4 py-3.5">
              <Ionicons name="key-outline" size={18} color={colors.searchIcon} style={{ marginRight: 12 }} />
              <TextInput
                className="flex-1 bg-transparent text-[16px] text-text-muted"
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={t("providerEdit.apiKeyPlaceholder")}
                placeholderTextColor={colors.chevron}
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowApiKey(!showApiKey)} className="ml-2 p-1 active:opacity-60">
                <Ionicons name={showApiKey ? "eye-off" : "eye"} size={20} color={colors.searchIcon} />
              </Pressable>
            </View>
          </View>

          {/* Advanced Settings Toggle */}
          <Pressable
            onPress={() => setShowAdvanced(!showAdvanced)}
            className="mt-4 flex-row items-center justify-between px-1 py-2"
          >
            <Text className="text-[13px] font-medium text-text-muted">{t("providerEdit.advancedSettings")}</Text>
            <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color={colors.searchIcon} />
          </Pressable>

          {showAdvanced && (
            <View className="overflow-hidden rounded-xl bg-bg-card mb-4">
              {providerType === "azure-openai" && (
                <View className="flex-row items-center border-b border-border-subtle px-4 py-3.5">
                  <Text className="w-24 text-[15px] text-text-main">API Ver.</Text>
                  <TextInput
                    className="flex-1 bg-transparent text-[16px] text-text-muted"
                    value={apiVersion}
                    onChangeText={setApiVersion}
                    placeholder="2024-02-01"
                    placeholderTextColor={colors.chevron}
                    autoCapitalize="none"
                  />
                </View>
              )}
              <View className="flex-row items-center justify-between border-b border-border-subtle px-4 py-3.5">
                <Text className="text-[15px] text-text-main">{t("providerEdit.enabled")}</Text>
                <Switch
                  value={providerEnabled}
                  onValueChange={setProviderEnabled}
                  trackColor={{ false: colors.switchTrack, true: colors.accent }}
                  thumbColor="#fff"
                  ios_backgroundColor={colors.switchTrack}
                />
              </View>
              {/* Custom Headers */}
              <View className="px-4 py-3.5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[14px] text-text-main">{t("providerEdit.customHeaders")}</Text>
                  <Pressable onPress={addCustomHeader} className="flex-row items-center active:opacity-60">
                    <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
                    <Text className="ml-1 text-[13px] font-medium text-primary">{t("common.add")}</Text>
                  </Pressable>
                </View>
                {customHeaders.map((h, idx) => (
                  <View key={idx} className="mb-2 flex-row items-center gap-2">
                    <TextInput
                      className="flex-1 rounded-lg bg-bg-hover px-3 py-2 text-[14px] text-text-main"
                      value={h.name}
                      onChangeText={(v) => updateCustomHeader(idx, "name", v)}
                      placeholder="Header"
                      placeholderTextColor={colors.chevron}
                      autoCapitalize="none"
                    />
                    <TextInput
                      className="flex-1 rounded-lg bg-bg-hover px-3 py-2 text-[14px] text-text-main"
                      value={h.value}
                      onChangeText={(v) => updateCustomHeader(idx, "value", v)}
                      placeholder="Value"
                      placeholderTextColor={colors.chevron}
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => removeCustomHeader(idx)} className="p-1 active:opacity-60">
                      <Ionicons name="close-circle" size={20} color={colors.danger} />
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
              disabled={testing || !baseUrl.trim() || !name.trim()}
              className={`flex-1 flex-row items-center justify-center rounded-xl py-3.5 ${
                testing ? "bg-primary/70" : connected === true ? "bg-accent-green" : connected === false ? "bg-error" : "bg-primary"
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

      {/* ── Step 3: Models (saved provider) ── */}
      {connected && savedProviderId && (
        <View className="px-4 pt-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-normal uppercase tracking-tight text-section-header">
              {t("providerEdit.pulledModels", { count: displayModels.length })}
            </Text>
            <View className="flex-row items-center gap-4">
              {displayModels.length > 0 && (
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
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color={colors.accent} />
                    <Text className="ml-1 text-[13px] font-medium text-primary">{t("providerEdit.refresh")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Model Search */}
          <View className="mt-3 flex-row items-center rounded-xl bg-bg-card px-3 py-2">
            <Ionicons name="search" size={16} color={colors.searchIcon} style={{ marginRight: 8 }} />
            <TextInput
              className="flex-1 text-[14px] text-text-main"
              value={modelSearch}
              onChangeText={setModelSearch}
              placeholder={t("providerEdit.searchModels")}
              placeholderTextColor={colors.chevron}
              autoCapitalize="none"
            />
            {modelSearch ? (
              <Pressable onPress={() => setModelSearch("")} className="active:opacity-60">
                <Ionicons name="close-circle" size={16} color={colors.searchIcon} />
              </Pressable>
            ) : null}
          </View>

          {/* Manual Add Model */}
          <View className="mt-2 flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-xl bg-bg-card px-3 py-2.5 text-[14px] text-text-main"
              value={newModelId}
              onChangeText={setNewModelId}
              placeholder={t("providerEdit.addModelPlaceholder")}
              placeholderTextColor={colors.chevron}
              autoCapitalize="none"
            />
            <Pressable
              onPress={handleAddModel}
              disabled={!newModelId.trim()}
              className={`rounded-xl px-4 py-2.5 ${newModelId.trim() ? "bg-primary" : "bg-bg-input"}`}
            >
              <Text className={`text-[14px] font-medium ${newModelId.trim() ? "text-white" : "text-text-hint"}`}>
                {t("common.add")}
              </Text>
            </Pressable>
          </View>

          {/* Model List */}
          <View className="mt-3 gap-2">
            {filteredModels.map((m) => (
              <View key={m.id} className="rounded-xl bg-bg-card px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className={`text-[15px] font-semibold ${m.enabled ? "text-text-main" : "text-text-hint"}`} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Text className="text-[12px] text-text-hint" numberOfLines={1}>{m.modelId}</Text>
                  </View>
                  <Switch
                    value={m.enabled}
                    onValueChange={() => toggleModel(m.id)}
                    trackColor={{ false: colors.switchTrack, true: colors.accent }}
                    thumbColor="#fff"
                    ios_backgroundColor={colors.switchTrack}
                  />
                </View>
                <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                  {[
                    { key: "vision", icon: "eye-outline", on: m.capabilities.vision },
                    { key: "tools", icon: "construct-outline", on: m.capabilities.toolCall },
                    { key: "reasoning", icon: "bulb-outline", on: m.capabilities.reasoning },
                  ].map((cap) => (
                    <View key={cap.key} className={`flex-row items-center rounded-md bg-bg-hover px-2 py-0.5 ${!cap.on ? "opacity-30" : ""}`}>
                      <Ionicons name={cap.icon as any} size={12} color={cap.on ? colors.accent : colors.searchIcon} style={{ marginRight: 3 }} />
                      <Text className="text-[11px] text-text-muted">{t(`providerEdit.${cap.key}`)}</Text>
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
                    className="flex-row items-center rounded-md bg-bg-hover px-2 py-0.5 active:opacity-60"
                  >
                    {probingModelId === m.id ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Ionicons name="pulse-outline" size={12} color={colors.accent} style={{ marginRight: 3 }} />
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

      {/* ── Step 3: Models (new provider, not yet saved) ── */}
      {connected && !savedProviderId && testPulledModels.length > 0 && (
        <View className="px-4 pt-6">
          <Text className="px-1 text-[13px] font-normal uppercase tracking-tight text-section-header">
            {t("providerEdit.pulledModels", { count: testPulledModels.length })}
          </Text>
          <View className="mt-3 gap-1.5">
            {testPulledModels.map((m) => (
              <View key={m.id} className="flex-row items-center rounded-xl bg-bg-card px-4 py-3">
                <Ionicons name="cube-outline" size={16} color={colors.accent} style={{ marginRight: 10 }} />
                <Text className="flex-1 text-[14px] text-text-main" numberOfLines={1}>{m.id}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Security note */}
      <View className="items-center px-6 pt-10 pb-8">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Ionicons name="lock-closed" size={12} color={colors.chevron} />
          <Text className="text-[11px] text-text-hint/40">{t("providerEdit.encryption")}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
