import { useState, useMemo, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Modal, FlatList } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { useProviderStore } from "../../../src/stores/provider-store";
import type { McpServer } from "../../../src/types";
import { ApiClient } from "../../../src/services/api-client";
import { DEFAULT_IDENTITY_PARAMS, IDENTITY_ICONS } from "../../../src/constants";

export default function IdentityEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const addIdentity = useIdentityStore((s) => s.addIdentity);
  const updateIdentity = useIdentityStore((s) => s.updateIdentity);
  const mcpTools = useIdentityStore((s) => s.mcpTools);
  const mcpServers = useIdentityStore((s) => s.mcpServers);

  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const getProviderById = useProviderStore((s) => s.getProviderById);

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);

  const existing = id ? getIdentityById(id) : undefined;
  const isNew = !existing;

  const [aiDesc, setAiDesc] = useState("");
  const [aiModelId, setAiModelId] = useState(enabledModels[0]?.id ?? "");
  const [aiLoading, setAiLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const selectedAiModel = models.find((m) => m.id === aiModelId);

  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "general");
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(
    existing?.params.temperature ?? DEFAULT_IDENTITY_PARAMS.temperature,
  );
  const [topP, setTopP] = useState(existing?.params.topP ?? DEFAULT_IDENTITY_PARAMS.topP);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(
    existing?.mcpToolIds ?? [],
  );
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(
    existing?.mcpServerIds ?? [],
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
      params: { temperature, topP },
      mcpToolIds: selectedToolIds,
      mcpServerIds: selectedServerIds,
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

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((s) => s !== serverId) : [...prev, serverId],
    );
  };

  const handleAiGenerate = async () => {
    if (!aiDesc.trim()) {
      Alert.alert(t("common.error"), t("identityEdit.aiDescRequired"));
      return;
    }
    if (!aiModelId) {
      Alert.alert(t("common.error"), t("identityEdit.aiSelectModel"));
      return;
    }
    const model = models.find((m) => m.id === aiModelId);
    if (!model) return;
    const provider = getProviderById(model.providerId);
    if (!provider) return;

    setAiLoading(true);
    try {
      const client = new ApiClient(provider);
      const icons = IDENTITY_ICONS.join(", ");
      const resp = await client.chat({
        model: model.modelId,
        messages: [
          {
            role: "system",
            content: `You generate identity cards for an AI assistant app. Given a description, return ONLY a JSON object with:\n- name: short name (2-4 words)\n- icon: one of [${icons}]\n- systemPrompt: a concise system prompt (2-4 sentences) defining the role, expertise, and tone.\nReturn raw JSON only, no markdown fences.`,
          },
          { role: "user", content: aiDesc.trim() },
        ],
        stream: false,
        temperature: 0.7,
      });

      const text = resp.choices?.[0]?.message?.content ?? "";
      const jsonStr = text.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim();
      const result = JSON.parse(jsonStr);

      if (result.name) setName(result.name);
      if (result.icon && IDENTITY_ICONS.includes(result.icon)) setIcon(result.icon);
      if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-white" keyboardShouldPersistTaps="handled">
      {isNew && enabledModels.length > 0 && (
        <View className="mx-4 mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="sparkles" size={18} color="#9333ea" />
            <Text className="text-sm font-semibold text-purple-800">{t("identityEdit.aiGenerate")}</Text>
          </View>

          <TextInput
            className="mt-3 rounded-lg border border-purple-200 bg-white px-3 py-2.5 text-sm text-text-main"
            value={aiDesc}
            onChangeText={setAiDesc}
            placeholder={t("identityEdit.aiDescPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />

          <View className="mt-3 flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowModelPicker(true)}
              className="flex-1 flex-row items-center justify-between rounded-lg border border-purple-200 bg-white px-3 py-2.5 active:opacity-80"
            >
              <Text className="text-xs text-text-muted" numberOfLines={1}>
                {selectedAiModel?.displayName ?? t("identityEdit.aiSelectModel")}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#9ca3af" />
            </Pressable>

            <Pressable
              onPress={handleAiGenerate}
              disabled={aiLoading || !aiDesc.trim()}
              className={`flex-row items-center gap-1.5 rounded-lg px-4 py-2.5 ${
                aiLoading || !aiDesc.trim() ? "bg-purple-300" : "bg-purple-600"
              }`}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="sparkles" size={14} color="#fff" />
              )}
              <Text className="text-sm font-semibold text-white">{t("identityEdit.generate")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={showModelPicker} transparent animationType="slide">
        <Pressable className="flex-1 bg-black/30" onPress={() => setShowModelPicker(false)} />
        <View className="bg-white rounded-t-2xl max-h-[50%] pb-8">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
            <Text className="text-base font-semibold text-text-main">{t("identityEdit.selectModel")}</Text>
            <Pressable onPress={() => setShowModelPicker(false)} className="active:opacity-60">
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>
          <FlatList
            data={enabledModels}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setAiModelId(item.id); setShowModelPicker(false); }}
                className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${item.id === aiModelId ? "bg-purple-50" : ""}`}
              >
                <Text className={`flex-1 text-sm ${item.id === aiModelId ? "font-semibold text-purple-700" : "text-text-main"}`}>
                  {item.displayName}
                </Text>
                {item.id === aiModelId && <Ionicons name="checkmark" size={18} color="#9333ea" />}
              </Pressable>
            )}
          />
        </View>
      </Modal>

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
      </View>

      {(mcpTools.length > 0 || mcpServers.length > 0) && (
        <View className="px-4 pt-4">
          <Text className="mb-2 text-sm font-medium text-text-muted">{t("identityEdit.bindTools")}</Text>

          {mcpTools.length > 0 && mcpTools.map((tool) => (
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
              <View className="ml-2 flex-1">
                <Text className="text-sm text-text-main">{tool.name}</Text>
              </View>
              <Text className="text-xs text-text-hint">{t("identityEdit.builtIn")}</Text>
            </Pressable>
          ))}

          {mcpServers.length > 0 && mcpServers.map((server) => (
            <Pressable
              key={server.id}
              onPress={() => toggleServer(server.id)}
              className="mb-2 flex-row items-center rounded-lg border border-border-light bg-bg-secondary px-3 py-2.5"
            >
              <Ionicons
                name={selectedServerIds.includes(server.id) ? "checkbox" : "square-outline"}
                size={20}
                color={selectedServerIds.includes(server.id) ? "#2b2bee" : "#9ca3af"}
              />
              <View className="ml-2 flex-1">
                <Text className="text-sm text-text-main">{server.name}</Text>
                <Text className="text-[11px] text-text-hint" numberOfLines={1}>{server.url}</Text>
              </View>
              <Ionicons name="cloud-outline" size={14} color="#9ca3af" />
            </Pressable>
          ))}
        </View>
      )}

      <View className="px-4 pb-8 pt-6">
        <Pressable onPress={handleSave} className="items-center rounded-2xl bg-primary py-4 active:opacity-80">
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
  const [trackWidth, setTrackWidth] = useState(0);

  const calcValue = (pageX: number, layoutX: number) => {
    const x = Math.max(0, Math.min(pageX - layoutX, trackWidth));
    const ratio = x / trackWidth;
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  };

  const trackRef = useRef<View>(null);
  const layoutXRef = useRef(0);

  return (
    <View className="mt-2">
      <View className="flex-row justify-between">
        <Text className="text-xs text-text-muted">{label}</Text>
        <Text className="text-xs font-medium text-text-main">{value.toFixed(2)}</Text>
      </View>
      <View
        ref={trackRef}
        className="h-10 justify-center"
        onLayout={(e) => {
          setTrackWidth(e.nativeEvent.layout.width);
          trackRef.current?.measureInWindow((x) => { layoutXRef.current = x; });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onChange(calcValue(e.nativeEvent.pageX, layoutXRef.current))}
        onResponderMove={(e) => onChange(calcValue(e.nativeEvent.pageX, layoutXRef.current))}
      >
        <View className="h-1.5 rounded-full bg-gray-200">
          <View
            className="h-1.5 rounded-full bg-primary"
            style={{ width: `${((value - min) / (max - min)) * 100}%` }}
          />
        </View>
        <View
          className="absolute h-5 w-5 rounded-full border-2 border-primary bg-white"
          style={{ left: `${((value - min) / (max - min)) * 100}%`, marginLeft: -10 }}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}
