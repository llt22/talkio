import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { DEFAULT_IDENTITY_PARAMS, IDENTITY_ICONS } from "../../../src/constants";
export default function IdentityEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const addIdentity = useIdentityStore((s) => s.addIdentity);
  const updateIdentity = useIdentityStore((s) => s.updateIdentity);
  const mcpTools = useIdentityStore((s) => s.mcpTools);

  const existing = id ? getIdentityById(id) : undefined;
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "general");
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(
    existing?.params.temperature ?? DEFAULT_IDENTITY_PARAMS.temperature,
  );
  const [topP, setTopP] = useState(existing?.params.topP ?? DEFAULT_IDENTITY_PARAMS.topP);
  const [maxTokens, setMaxTokens] = useState(
    existing?.params.maxTokens ?? DEFAULT_IDENTITY_PARAMS.maxTokens,
  );
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(
    existing?.mcpToolIds ?? [],
  );

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("identityEdit.nameRequired"));
      return;
    }
    if (!systemPrompt.trim()) {
      Alert.alert(t("common.error"), t("identityEdit.promptRequired"));
      return;
    }

    const data = {
      name: name.trim(),
      icon,
      systemPrompt: systemPrompt.trim(),
      params: { temperature, topP, maxTokens },
      mcpToolIds: selectedToolIds,
    };

    if (isNew) {
      addIdentity(data);
    } else {
      updateIdentity(id!, data);
    }
    router.back();
  };

  const toggleTool = (toolId: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  };

  return (
    <ScrollView className="flex-1 bg-white" keyboardShouldPersistTaps="handled">
      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("identityEdit.name")}</Text>
        <TextInput
          className="rounded-xl border border-border-light bg-bg-secondary px-4 py-3 text-base text-text-main"
          value={name}
          onChangeText={setName}
          placeholder={t("identityEdit.namePlaceholder")}
          placeholderTextColor="#9ca3af"
        />
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-2 text-sm font-medium text-text-muted">{t("identityEdit.icon")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {IDENTITY_ICONS.map((ic) => (
            <Pressable
              key={ic}
              onPress={() => setIcon(ic)}
              className={`mr-2 rounded-lg border px-3 py-2 ${
                icon === ic ? "border-primary bg-primary-light" : "border-border-light"
              }`}
            >
              <Text className={`text-xs ${icon === ic ? "text-primary" : "text-text-muted"}`}>
                {ic}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("identityEdit.systemPrompt")}</Text>
        <TextInput
          className="min-h-[120px] rounded-xl border border-border-light bg-bg-secondary px-4 py-3 text-sm leading-5 text-text-main"
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          placeholder={t("identityEdit.systemPromptPlaceholder")}
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-2 text-sm font-medium text-text-muted">{t("identityEdit.parameters")}</Text>
        <ParamSlider label={t("identityEdit.temperature")} value={temperature} min={0} max={2} step={0.1} onChange={setTemperature} />
        <ParamSlider label={t("identityEdit.topP")} value={topP} min={0} max={1} step={0.05} onChange={setTopP} />
        <View className="mt-2">
          <Text className="text-xs text-text-muted">{t("identityEdit.maxTokens", { value: maxTokens })}</Text>
          <TextInput
            className="mt-1 rounded-lg border border-border-light bg-bg-secondary px-3 py-2 text-sm text-text-main"
            value={String(maxTokens)}
            onChangeText={(v) => setMaxTokens(parseInt(v, 10) || 4096)}
            keyboardType="number-pad"
          />
        </View>
      </View>

      {mcpTools.length > 0 && (
        <View className="px-4 pt-4">
          <Text className="mb-2 text-sm font-medium text-text-muted">{t("identityEdit.bindTools")}</Text>
          {mcpTools.map((tool) => (
            <Pressable
              key={tool.id}
              onPress={() => toggleTool(tool.id)}
              className="mb-2 flex-row items-center rounded-lg border border-border-light bg-bg-secondary px-3 py-2.5"
            >
              <Ionicons
                name={selectedToolIds.includes(tool.id) ? "checkbox" : "square-outline"}
                size={20}
                color={selectedToolIds.includes(tool.id) ? "#2b2bee" : "#9ca3af"}
              />
              <Text className="ml-2 flex-1 text-sm text-text-main">{tool.name}</Text>
              <Text className="text-xs text-text-hint">{tool.type}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View className="px-4 pb-8 pt-6">
        <Pressable onPress={handleSave} className="items-center rounded-2xl bg-primary py-4">
          <Text className="text-base font-semibold text-white">
            {isNew ? t("identityEdit.createIdentity") : t("identityEdit.saveChanges")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="mt-2">
      <View className="flex-row justify-between">
        <Text className="text-xs text-text-muted">{label}</Text>
        <Text className="text-xs font-medium text-text-main">{value.toFixed(2)}</Text>
      </View>
      <View className="h-10 justify-center">
        <View className="h-1 rounded-full bg-gray-200">
          <View
            className="h-1 rounded-full bg-primary"
            style={{ width: `${((value - min) / (max - min)) * 100}%` }}
          />
        </View>
      </View>
    </View>
  );
}
