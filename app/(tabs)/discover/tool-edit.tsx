import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CustomHeader } from "../../../src/types";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { useThemeColors } from "../../../src/hooks/useThemeColors";
import { listRemoteTools } from "../../../src/services/mcp-client";
// MCP Server editor

export default function ToolEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const getMcpServerById = useIdentityStore((s) => s.getMcpServerById);
  const addMcpServer = useIdentityStore((s) => s.addMcpServer);
  const updateMcpServer = useIdentityStore((s) => s.updateMcpServer);
  const removeMcpServer = useIdentityStore((s) => s.removeMcpServer);

  const existing = id ? getMcpServerById(id) : undefined;
  const isNew = !existing;
  const colors = useThemeColors();

  const [name, setName] = useState(existing?.name ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [headers, setHeaders] = useState<CustomHeader[]>(existing?.customHeaders ?? []);
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("toolEdit.nameRequired"));
      return;
    }
    if (!url.trim()) {
      Alert.alert(t("common.error"), t("toolEdit.endpointRequired"));
      return;
    }

    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const data = {
      name: name.trim(),
      url: url.trim(),
      enabled,
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
    };

    if (isNew) {
      addMcpServer(data);
    } else {
      updateMcpServer(id!, data);
    }
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-bg-light" keyboardShouldPersistTaps="handled">
      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("toolEdit.name")}</Text>
        <TextInput
          className="rounded-xl bg-bg-secondary px-4 py-3 text-base text-text-main"
          value={name}
          onChangeText={setName}
          placeholder={t("toolEdit.namePlaceholder")}
          placeholderTextColor={colors.searchIcon}
        />
      </View>

      <View className="px-4 pt-4">
        <Text className="mb-1 text-sm font-medium text-text-muted">{t("toolEdit.endpointUrl")}</Text>
        <TextInput
          className="rounded-xl bg-bg-secondary px-4 py-3 text-sm text-text-main"
          value={url}
          onChangeText={setUrl}
          placeholder="https://mcp.example.com/mcp"
          placeholderTextColor={colors.searchIcon}
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
            className="active:opacity-60"
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
          </Pressable>
        </View>
        {headers.map((h, i) => (
          <View key={i} className="mb-2 flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-main"
              value={h.name}
              onChangeText={(v) => {
                const next = [...headers];
                next[i] = { ...next[i], name: v };
                setHeaders(next);
              }}
              placeholder="Header name"
              placeholderTextColor={colors.searchIcon}
              autoCapitalize="none"
            />
            <TextInput
              className="flex-[2] rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-main"
              value={h.value}
              onChangeText={(v) => {
                const next = [...headers];
                next[i] = { ...next[i], value: v };
                setHeaders(next);
              }}
              placeholder="Value"
              placeholderTextColor={colors.searchIcon}
              autoCapitalize="none"
              secureTextEntry={h.name.toLowerCase().includes("auth") || h.name.toLowerCase().includes("key")}
            />
            <Pressable
              onPress={() => setHeaders(headers.filter((_, j) => j !== i))}
              hitSlop={8}
              className="active:opacity-60"
            >
              <Ionicons name="close-circle" size={20} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        {headers.length === 0 && (
          <Text className="text-xs text-text-hint">{t("toolEdit.headersHint")}</Text>
        )}
      </View>

      <View className="px-4 pt-4">
        <Pressable
          onPress={async () => {
            if (!url.trim()) {
              Alert.alert(t("common.error"), t("toolEdit.endpointRequired"));
              return;
            }
            setTesting(true);
            try {
              const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
              const tools = await Promise.race([
                listRemoteTools(url.trim(), validHeaders.length > 0 ? validHeaders : undefined),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("Connection timeout (10s)")), 10000),
                ),
              ]);
              Alert.alert(
                "✅",
                t("toolEdit.testSuccess", { count: tools.length }) +
                  (tools.length > 0 ? "\n\n" + tools.map((t_) => `• ${t_.name}`).join("\n") : ""),
              );
            } catch (err) {
              Alert.alert(
                t("toolEdit.testFailed"),
                err instanceof Error ? err.message : "Unknown error",
              );
            } finally {
              setTesting(false);
            }
          }}
          disabled={testing}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-3 active:opacity-70"
        >
          {testing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="flash-outline" size={18} color={colors.accent} />
          )}
          <Text className="text-sm font-medium text-primary">
            {testing ? t("toolEdit.testing") : t("toolEdit.testConnection")}
          </Text>
        </Pressable>
      </View>

      <View className="mx-4 mt-4 flex-row items-center justify-between rounded-xl bg-bg-secondary px-4 py-3">
        <Text className="text-sm text-text-main">{t("toolEdit.enabled")}</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: colors.switchTrack, true: colors.accent }} thumbColor="#fff" ios_backgroundColor={colors.switchTrack} />
      </View>

      <View className="px-4 pb-8 pt-6 gap-3">
        <Pressable onPress={handleSave} className="items-center rounded-2xl bg-primary py-4 active:opacity-70">
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
                  onPress: () => { removeMcpServer(id!); router.back(); },
                },
              ]);
            }}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="text-sm text-error">{t("common.delete")}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
