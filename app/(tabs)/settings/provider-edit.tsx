import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Switch } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { PROVIDER_PRESETS } from "../../../src/constants";
import type { Model } from "../../../src/types";

export default function ProviderEditScreen() {
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
  const allModels = useProviderStore((s) => s.models);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pulledModels, setPulledModels] = useState<Model[]>([]);
  const [pulling, setPulling] = useState(false);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

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
    }
  };

  const handleTest = async () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      Alert.alert("Error", "All fields are required");
      return;
    }

    setTesting(true);

    let providerId = savedProviderId;
    if (isEditing && providerId) {
      updateProvider(providerId, {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });
    } else {
      const provider = addProvider({
        name: name.trim(),
        type: "official",
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });
      providerId = provider.id;
      setSavedProviderId(providerId);
    }

    const ok = await testConnection(providerId!);
    setConnected(ok);
    setTesting(false);

    if (!ok) {
      Alert.alert("Connection Failed", "Check your API key and base URL.");
    }
  };

  const handlePullModels = async () => {
    if (!savedProviderId) return;
    setPulling(true);
    try {
      const models = await fetchModels(savedProviderId);
      setPulledModels(models);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to fetch models");
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
      });
    }
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-bg-secondary" keyboardShouldPersistTaps="handled">
      <View className="px-4 pt-4">
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Quick Select</Text>
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
          Provider Details
        </Text>
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
            <Text className="w-24 text-[15px] text-slate-900">Name</Text>
            <TextInput
              className="flex-1 bg-transparent text-[16px] text-slate-600"
              value={name}
              onChangeText={setName}
              placeholder="e.g. OpenRouter"
              placeholderTextColor="#cbd5e1"
            />
          </View>
          <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5">
            <Text className="w-24 text-[15px] text-slate-900">Base URL</Text>
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
            <Text className="w-24 text-[15px] text-slate-900">API Key</Text>
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
        </View>
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
              <Text className="text-base font-semibold text-white">Connection Successful</Text>
            </>
          ) : connected === false ? (
            <Text className="text-base font-semibold text-white">Connection Failed — Retry</Text>
          ) : (
            <Text className="text-base font-semibold text-white">Test Connection</Text>
          )}
        </Pressable>
        {connected === true && (
          <Text className="mt-2 text-center text-[12px] text-slate-400">
            Verified at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} Today
          </Text>
        )}
      </View>

      {connected && (
        <View className="px-4 pt-6">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-normal uppercase tracking-tight text-slate-500">
              Pulled Models ({pulledModels.length})
            </Text>
            <Pressable onPress={handlePullModels} disabled={pulling} className="flex-row items-center">
              {pulling ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  <Ionicons name="refresh" size={14} color="#007AFF" />
                  <Text className="ml-1 text-[13px] font-medium text-primary">Refresh</Text>
                </>
              )}
            </Pressable>
          </View>

          <View className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {displayModels.map((m, idx) => (
              <View
                key={m.id}
                className={`flex-row items-center justify-between px-4 py-3 ${idx < displayModels.length - 1 ? "border-b border-slate-100" : ""}`}
              >
                <View className="flex-1 mr-3">
                  <Text className={`text-[15px] font-medium ${m.enabled ? "text-slate-900" : "text-slate-400"}`} numberOfLines={1}>
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
            ))}
          </View>
        </View>
      )}

      <View className="px-4 pb-8 pt-6">
        {connected && (
          <Pressable onPress={handleSave} className="items-center rounded-xl bg-primary py-3.5"
          >
            <Text className="text-[17px] font-semibold text-white">Save</Text>
          </Pressable>
        )}
      </View>

      <View className="items-center pb-8 px-6">
        <View className="flex-row items-center gap-1.5 mb-2">
          <Ionicons name="lock-closed" size={14} color="#94a3b8" />
          <Text className="text-[11px] font-medium uppercase tracking-tight text-slate-500">
            End-to-End Encryption
          </Text>
        </View>
        <Text className="text-center text-[12px] leading-normal text-slate-400">
          API keys are stored securely on this device and are never sent to our servers.
        </Text>
      </View>
    </ScrollView>
  );
}
