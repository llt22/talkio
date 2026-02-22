import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "../../../src/stores/settings-store";
import { ApiClient } from "../../../src/services/api-client";

const STT_PRESETS = [
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
];

export default function SttSettingsScreen() {
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

  const makeClient = () =>
    new ApiClient({
      id: "stt-probe",
      name: "STT",
      type: "openai",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
      status: "connected",
      createdAt: "",
      customHeaders: [],
    });

  const doFetchModels = async () => {
    setPulling(true);
    try {
      const raw = await makeClient().listModels();
      const ids = raw.map((m) => m.id).sort();
      setFetchedModels(ids);
      if (ids.length > 0 && !ids.includes(model)) setModel(ids[0]);
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : t("providerEdit.fetchFailed"));
    } finally {
      setPulling(false);
    }
  };

  const handleConnect = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      Alert.alert(t("common.error"), t("settings.sttFetchRequiresFields"));
      return;
    }
    setTesting(true);
    setConnected(null);
    try {
      const ok = await makeClient().testConnection();
      setConnected(ok);
      if (ok) {
        await doFetchModels();
      } else {
        Alert.alert(t("providerEdit.connectionFailed"), t("providerEdit.connectionFailedHint"));
      }
    } catch {
      setConnected(false);
      Alert.alert(t("providerEdit.connectionFailed"), t("providerEdit.connectionFailedHint"));
    } finally {
      setTesting(false);
    }
  };

  const displayModels = modelSearch
    ? fetchedModels.filter((id) => id.toLowerCase().includes(modelSearch.toLowerCase()))
    : fetchedModels;

  return (
    <ScrollView className="flex-1 bg-bg-secondary" contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="px-4 pt-4 gap-3">
        {/* Presets */}
        <View className="flex-row gap-2">
          {STT_PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => { setBaseUrl(preset.baseUrl); setConnected(null); setFetchedModels([]); }}
              className={`flex-1 items-center rounded-xl border py-2.5 active:opacity-70 ${
                baseUrl === preset.baseUrl ? "border-primary bg-primary/5" : "border-slate-200 bg-white"
              }`}
            >
              <Text className={`text-[13px] font-semibold ${
                baseUrl === preset.baseUrl ? "text-primary" : "text-slate-500"
              }`}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Base URL */}
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <View className="flex-row items-center px-4 py-3.5">
            <Ionicons name="link-outline" size={18} color="#94a3b8" style={{ marginRight: 12 }} />
            <TextInput
              className="flex-1 bg-transparent text-[16px] text-slate-600"
              value={baseUrl}
              onChangeText={(v) => { setBaseUrl(v); setConnected(null); setFetchedModels([]); }}
              placeholder="https://api.groq.com/openai/v1"
              placeholderTextColor="#cbd5e1"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* API Key */}
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <View className="flex-row items-center px-4 py-3.5">
            <Ionicons name="key-outline" size={18} color="#94a3b8" style={{ marginRight: 12 }} />
            <TextInput
              className="flex-1 bg-transparent text-[16px] text-slate-600"
              value={apiKey}
              onChangeText={(v) => { setApiKey(v); setConnected(null); setFetchedModels([]); }}
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

        {/* Connect Button */}
        <Pressable
          onPress={handleConnect}
          disabled={testing || pulling}
          className={`mt-1 flex-row items-center justify-center rounded-xl py-3.5 active:opacity-70 ${
            testing || pulling
              ? "bg-slate-300"
              : connected === true
                ? "bg-accent-green"
                : connected === false
                  ? "bg-error"
                  : "bg-primary"
          }`}
        >
          {testing || pulling ? (
            <>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text className="text-base font-semibold text-white">
                {pulling ? t("providerEdit.fetchingModels") : t("providerEdit.connecting")}
              </Text>
            </>
          ) : connected === true ? (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text className="text-base font-semibold text-white">{t("providerEdit.connectionSuccessful")}</Text>
            </>
          ) : connected === false ? (
            <Text className="text-base font-semibold text-white">{t("providerEdit.retryConnection")}</Text>
          ) : (
            <Text className="text-base font-semibold text-white">{t("providerEdit.connectAndFetch")}</Text>
          )}
        </Pressable>
      </View>

      {/* Model List */}
      {(connected || displayModels.length > 0) && (
        <View className="px-4 pt-6">
          <View className="flex-row items-center justify-between px-1 mb-3">
            <Text className="text-[13px] font-normal uppercase tracking-tight text-slate-500">
              {t("settings.sttModelLabel")} ({displayModels.length})
            </Text>
            <Pressable onPress={doFetchModels} disabled={pulling} className="flex-row items-center active:opacity-60">
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

          {/* Search */}
          {fetchedModels.length > 0 && (
            <View className="mb-3 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 py-2">
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
          )}

          <View className="gap-2">
            {displayModels.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  setModel(id);
                  updateSettings({ sttBaseUrl: baseUrl.trim(), sttApiKey: apiKey.trim(), sttModel: id });
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex-row items-center justify-between active:bg-slate-50"
              >
                <Text className="flex-1 text-[15px] text-slate-900" numberOfLines={1}>{id}</Text>
                {model === id && <Ionicons name="checkmark-circle" size={20} color="#007AFF" />}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
