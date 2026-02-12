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

  const addProvider = useProviderStore((s) => s.addProvider);
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
    }
  };

  const handleTest = async () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      Alert.alert(t("common.error"), t("providerEdit.allFieldsRequired"));
      return;
    }

    setTesting(true);

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
    if (isEditing && providerId) {
      updateProvider(providerId, providerData);
    } else {
      const provider = addProvider(providerData);
      providerId = provider.id;
      setSavedProviderId(providerId);
    }

    const ok = await testConnection(providerId!);
    setConnected(ok);
    setTesting(false);

    if (!ok) {
      Alert.alert(t("providerEdit.connectionFailed"), t("providerEdit.connectionFailedHint"));
    }
  };

  const handlePullModels = async () => {
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

  return (
    <ScrollView className="flex-1 bg-bg-secondary" keyboardShouldPersistTaps="handled">
      <View className="px-4 pt-4">
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">{t("providerEdit.quickSelect")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {Object.keys(PROVIDER_PRESETS).map((key) => (
            <Pressable
              key={key}
              onPress={() => applyPreset(key)}
              className="mr-2 rounded-full border border-border-light bg-white px-3 py-1.5"
            >
              <Text className="text-xs text-text-muted">{PROVIDER_PRESETS[key].name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View className="px-4 pt-6">
        <Text className="mb-2 px-1 text-[13px] font-normal uppercase tracking-tight text-slate-500">
          {t("providerEdit.providerDetails")}
        </Text>
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
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
          <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
            <Text className="w-24 text-[15px] text-slate-900">{t("providerEdit.apiKey")}</Text>
            <TextInput
              className="flex-1 bg-transparent text-[16px] text-slate-600"
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-..."
              placeholderTextColor="#cbd5e1"
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowApiKey(!showApiKey)} className="ml-2 p-1">
              <Ionicons name={showApiKey ? "eye-off" : "eye"} size={20} color="#94a3b8" />
            </Pressable>
          </View>
          <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
            <Text className="w-24 text-[15px] text-slate-900">{t("providerEdit.type")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
              <View className="flex-row gap-2">
                {PROVIDER_TYPE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setProviderType(opt.value)}
                    className={`rounded-full border px-3 py-1.5 ${
                      providerType === opt.value
                        ? "border-primary bg-primary-light"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${
                        providerType === opt.value ? "text-primary" : "text-slate-500"
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
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
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <Text className="text-[15px] text-slate-900">{t("providerEdit.enabled")}</Text>
            <Switch
              value={providerEnabled}
              onValueChange={setProviderEnabled}
              trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
              thumbColor="#fff"
              ios_backgroundColor="#e5e7eb"
            />
          </View>
        </View>
      </View>

      {/* Custom Headers */}
      <View className="px-4 pt-4">
        <View className="flex-row items-center justify-between px-1 mb-2">
          <Text className="text-[13px] font-normal uppercase tracking-tight text-slate-500">
            {t("providerEdit.customHeaders")}
          </Text>
          <Pressable onPress={addCustomHeader} className="flex-row items-center">
            <Ionicons name="add-circle-outline" size={16} color="#007AFF" />
            <Text className="ml-1 text-[13px] font-medium text-primary">{t("common.add")}</Text>
          </Pressable>
        </View>
        {customHeaders.map((h, idx) => (
          <View key={idx} className="mb-2 flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
              value={h.name}
              onChangeText={(v) => updateCustomHeader(idx, "name", v)}
              placeholder="Header Name"
              placeholderTextColor="#cbd5e1"
              autoCapitalize="none"
            />
            <TextInput
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
              value={h.value}
              onChangeText={(v) => updateCustomHeader(idx, "value", v)}
              placeholder="Value"
              placeholderTextColor="#cbd5e1"
              autoCapitalize="none"
            />
            <Pressable onPress={() => removeCustomHeader(idx)} className="p-1">
              <Ionicons name="close-circle" size={20} color="#ef4444" />
            </Pressable>
          </View>
        ))}
      </View>

      <View className="px-4 pt-6">
        <Pressable
          onPress={handleTest}
          disabled={testing}
          className={`flex-row items-center justify-center rounded-xl py-3.5 ${
            connected === true ? "bg-accent-green" : connected === false ? "bg-error" : "bg-primary"
          }`}
        >
          {testing ? (
            <ActivityIndicator color="#fff" />
          ) : connected === true ? (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text className="text-base font-semibold text-white">{t("providerEdit.connectionSuccessful")}</Text>
            </>
          ) : connected === false ? (
            <Text className="text-base font-semibold text-white">{t("providerEdit.connectionFailed")}</Text>
          ) : (
            <Text className="text-base font-semibold text-white">{t("providerEdit.testConnection")}</Text>
          )}
        </Pressable>
        {connected === true && (
          <Text className="mt-2 text-center text-[12px] text-slate-400">
            {t("providerEdit.verifiedAt", { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
          </Text>
        )}
      </View>

      {connected && (
        <View className="px-4 pt-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-normal uppercase tracking-tight text-slate-500">
              {t("providerEdit.pulledModels", { count: displayModels.length })}
            </Text>
            <View className="flex-row items-center gap-4">
              {savedProviderId && displayModels.length > 0 && (
                <>
                  <Pressable onPress={() => {
                    const allEnabled = displayModels.every((m) => m.enabled);
                    setProviderModelsEnabled(savedProviderId, !allEnabled);
                  }}>
                    <Text className="text-[13px] font-medium text-primary">
                      {displayModels.every((m) => m.enabled) ? t("providerEdit.deselectAll") : t("providerEdit.selectAll")}
                    </Text>
                  </Pressable>
                </>
              )}
            <Pressable onPress={handlePullModels} disabled={pulling} className="flex-row items-center">
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
              <Pressable onPress={() => setModelSearch("")}>
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

          <View className="mt-3 gap-3">
            {filteredModels.map((m) => (
              <View
                key={m.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className={`text-[17px] font-semibold ${m.enabled ? "text-slate-900" : "text-slate-400"}`} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    <Text className="text-[13px] text-slate-400" numberOfLines={1}>{m.modelId}</Text>
                  </View>
                  <Switch
                    value={m.enabled}
                    onValueChange={() => toggleModel(m.id)}
                    trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
                    thumbColor="#fff"
                    ios_backgroundColor="#e5e7eb"
                  />
                </View>
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <View className={`flex-row items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-1 ${!m.capabilities.vision ? "opacity-40" : ""}`}>
                    <Ionicons name="eye-outline" size={14} color={m.capabilities.vision ? "#007AFF" : "#94a3b8"} style={{ marginRight: 4 }} />
                    <Text className="text-[12px] font-medium text-slate-700">{t("providerEdit.vision")}</Text>
                  </View>
                  <View className={`flex-row items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-1 ${!m.capabilities.toolCall ? "opacity-40" : ""}`}>
                    <Ionicons name="construct-outline" size={14} color={m.capabilities.toolCall ? "#007AFF" : "#94a3b8"} style={{ marginRight: 4 }} />
                    <Text className="text-[12px] font-medium text-slate-700">{t("providerEdit.tools")}</Text>
                  </View>
                  <View className={`flex-row items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-1 ${!m.capabilities.reasoning ? "opacity-40" : ""}`}>
                    <Ionicons name="bulb-outline" size={14} color={m.capabilities.reasoning ? "#007AFF" : "#94a3b8"} style={{ marginRight: 4 }} />
                    <Text className="text-[12px] font-medium text-slate-700">{t("providerEdit.reasoning")}</Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      setProbingModelId(m.id);
                      try {
                        await probeModelCapabilities(m.id);
                      } catch (err) {
                        Alert.alert(t("common.error"), err instanceof Error ? err.message : "Probe failed");
                      } finally {
                        setProbingModelId(null);
                      }
                    }}
                    disabled={probingModelId === m.id}
                    className="flex-row items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1"
                  >
                    {probingModelId === m.id ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <>
                        <Ionicons name="pulse-outline" size={14} color="#007AFF" style={{ marginRight: 4 }} />
                        <Text className="text-[12px] font-medium text-primary">{t("providerEdit.probe")}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="px-4 pb-8 pt-6">
        {connected && (
          <Pressable onPress={handleSave} className="items-center rounded-xl bg-primary py-3.5"
          >
            <Text className="text-[17px] font-semibold text-white">{t("providerEdit.save")}</Text>
          </Pressable>
        )}
      </View>

      <View className="items-center pb-8 px-6">
        <View className="flex-row items-center gap-1.5 mb-2">
          <Ionicons name="lock-closed" size={14} color="#94a3b8" />
          <Text className="text-[11px] font-medium uppercase tracking-tight text-slate-500">
            {t("providerEdit.encryption")}
          </Text>
        </View>
        <Text className="text-center text-[12px] leading-normal text-slate-400">
          {t("providerEdit.encryptionHint")}
        </Text>
      </View>
    </ScrollView>
  );
}
