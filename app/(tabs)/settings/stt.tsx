import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "../../../src/stores/settings-store";

const STT_MODELS = [
  { label: "whisper-large-v3-turbo", value: "whisper-large-v3-turbo" },
  { label: "whisper-large-v3", value: "whisper-large-v3" },
  { label: "whisper-1", value: "whisper-1" },
];

export default function SttSettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [baseUrl, setBaseUrl] = useState(settings.sttBaseUrl);
  const [apiKey, setApiKey] = useState(settings.sttApiKey);
  const [model, setModel] = useState(settings.sttModel);

  const handleSave = () => {
    if (!apiKey.trim()) {
      Alert.alert(t("common.error"), t("settings.sttApiKeyRequired"));
      return;
    }
    updateSettings({ sttBaseUrl: baseUrl.trim(), sttApiKey: apiKey.trim(), sttModel: model });
    Alert.alert(t("common.success"), t("settings.sttSaved"));
  };

  return (
    <ScrollView className="flex-1 bg-bg-secondary" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Base URL */}
      <View className="px-5 pt-4 mb-4">
        <Text className="mb-1.5 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Base URL
        </Text>
        <View className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://api.groq.com/openai/v1"
            placeholderTextColor="#cbd5e1"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-[15px] text-text-main"
          />
        </View>
      </View>

      {/* API Key */}
      <View className="px-5 mb-4">
        <Text className="mb-1.5 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          API Key
        </Text>
        <View className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder={t("settings.sttApiKeyPlaceholder")}
            placeholderTextColor="#cbd5e1"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            className="text-[15px] text-text-main"
          />
        </View>
      </View>

      {/* Model */}
      <View className="px-5 mb-6">
        <Text className="mb-1.5 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.sttModelLabel")}
        </Text>
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {STT_MODELS.map((m, idx) => (
            <Pressable
              key={m.value}
              onPress={() => setModel(m.value)}
              className={`flex-row items-center justify-between px-4 py-3 ${
                idx < STT_MODELS.length - 1 ? "border-b border-slate-50" : ""
              }`}
            >
              <Text className="text-[15px] text-text-main">{m.label}</Text>
              {model === m.value && <Ionicons name="checkmark" size={18} color="#007AFF" />}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Save */}
      <View className="px-5">
        <Pressable onPress={handleSave} className="items-center rounded-xl bg-primary py-3.5">
          <Text className="text-base font-semibold text-white">{t("common.save")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
