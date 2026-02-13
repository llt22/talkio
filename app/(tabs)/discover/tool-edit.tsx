import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CustomHeader } from "../../../src/types";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIdentityStore } from "../../../src/stores/identity-store";
// Remote MCP tool editor (built-in tools are managed separately)

export default function ToolEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const getMcpToolById = useIdentityStore((s) => s.getMcpToolById);
  const addMcpTool = useIdentityStore((s) => s.addMcpTool);
  const updateMcpTool = useIdentityStore((s) => s.updateMcpTool);
  const removeMcpTool = useIdentityStore((s) => s.removeMcpTool);

  const existing = id ? getMcpToolById(id) : undefined;
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [headers, setHeaders] = useState<CustomHeader[]>(existing?.customHeaders ?? []);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("toolEdit.nameRequired"));
      return;
    }
    if (!endpoint.trim()) {
      Alert.alert(t("common.error"), t("toolEdit.endpointRequired"));
      return;
    }

    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const data = {
      name: name.trim(),
      type: "remote" as const,
      scope: "global" as const,
      description: description.trim(),
      endpoint: endpoint.trim(),
      nativeModule: null,
      permissions: [] as string[],
      enabled,
      schema: {
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        description: description.trim(),
        parameters: { type: "object" as const, properties: {} },
      },
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
    };

    if (isNew) {
      addMcpTool(data);
    } else {
      updateMcpTool(id!, data);
    }
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-white" keyboardShouldPersistTaps="handled">
      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("toolEdit.name")}</Text>
        <TextInput
          className="rounded-xl border border-border-light bg-bg-secondary px-4 py-3 text-base text-text-main"
          value={name}
          onChangeText={setName}
          placeholder={t("toolEdit.namePlaceholder")}
          placeholderTextColor="#9ca3af"
        />
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("toolEdit.description")}</Text>
        <TextInput
          className="min-h-[80px] rounded-xl border border-border-light bg-bg-secondary px-4 py-3 text-sm text-text-main"
          value={description}
          onChangeText={setDescription}
          placeholder={t("toolEdit.descPlaceholder")}
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("toolEdit.endpointUrl")}</Text>
        <TextInput
          className="rounded-xl border border-border-light bg-bg-secondary px-4 py-3 text-sm text-text-main"
          value={endpoint}
          onChangeText={setEndpoint}
          placeholder="https://mcp-server.example.com/sse"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View className="px-4 pt-4">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-text-muted">{t("toolEdit.headers")}</Text>
          <Pressable
            onPress={() => setHeaders([...headers, { name: "", value: "" }])}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color="#007AFF" />
          </Pressable>
        </View>
        {headers.map((h, i) => (
          <View key={i} className="mb-2 flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg border border-border-light bg-bg-secondary px-3 py-2 text-sm text-text-main"
              value={h.name}
              onChangeText={(v) => {
                const next = [...headers];
                next[i] = { ...next[i], name: v };
                setHeaders(next);
              }}
              placeholder="Header name"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
            />
            <TextInput
              className="flex-[2] rounded-lg border border-border-light bg-bg-secondary px-3 py-2 text-sm text-text-main"
              value={h.value}
              onChangeText={(v) => {
                const next = [...headers];
                next[i] = { ...next[i], value: v };
                setHeaders(next);
              }}
              placeholder="Value"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              secureTextEntry={h.name.toLowerCase().includes("auth") || h.name.toLowerCase().includes("key")}
            />
            <Pressable
              onPress={() => setHeaders(headers.filter((_, j) => j !== i))}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color="#ef4444" />
            </Pressable>
          </View>
        ))}
        {headers.length === 0 && (
          <Text className="text-xs text-slate-400">{t("toolEdit.headersHint")}</Text>
        )}
      </View>

      <View className="mx-4 mt-4 flex-row items-center justify-between rounded-xl border border-border-light bg-bg-secondary px-4 py-3">
        <Text className="text-sm text-text-main">{t("toolEdit.enabled")}</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: "#e5e7eb", true: "#007AFF" }} thumbColor="#fff" ios_backgroundColor="#e5e7eb" />
      </View>

      <View className="px-4 pb-8 pt-6 gap-3">
        <Pressable onPress={handleSave} className="items-center rounded-2xl bg-primary py-4">
          <Text className="text-base font-semibold text-white">
            {isNew ? t("toolEdit.addTool") : t("toolEdit.saveChanges")}
          </Text>
        </Pressable>
        {!isNew && (
          <Pressable
            onPress={() => {
              Alert.alert(t("common.delete"), t("common.areYouSure"), [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("common.delete"),
                  style: "destructive",
                  onPress: () => { removeMcpTool(id!); router.back(); },
                },
              ]);
            }}
            className="items-center py-2"
          >
            <Text className="text-sm text-red-500">{t("common.delete")}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
