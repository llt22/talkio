import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, Switch, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIdentityStore } from "../../../src/stores/identity-store";
import type { Identity, McpServer } from "../../../src/types";

type Tab = "identities" | "tools";

const ICON_COLORS: Array<{ bg: string; color: string }> = [
  { bg: "bg-blue-100", color: "#2563eb" },
  { bg: "bg-purple-100", color: "#9333ea" },
  { bg: "bg-rose-100", color: "#e11d48" },
  { bg: "bg-amber-100", color: "#d97706" },
  { bg: "bg-emerald-100", color: "#059669" },
  { bg: "bg-cyan-100", color: "#0891b2" },
];

const IDENTITY_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  "terminal-outline",
  "sparkles",
  "bug-outline",
  "language-outline",
  "code-slash-outline",
  "leaf-outline",
];

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const identities = useIdentityStore((s) => s.identities);
  const mcpTools = useIdentityStore((s) => s.mcpTools);
  const mcpServers = useIdentityStore((s) => s.mcpServers);
  const removeIdentity = useIdentityStore((s) => s.removeIdentity);
  const updateMcpTool = useIdentityStore((s) => s.updateMcpTool);
  const addMcpServer = useIdentityStore((s) => s.addMcpServer);
  const updateMcpServer = useIdentityStore((s) => s.updateMcpServer);
  const removeMcpServer = useIdentityStore((s) => s.removeMcpServer);
  const [activeTab, setActiveTab] = useState<Tab>("identities");

  const builtInTools = mcpTools.filter((t) => t.builtIn);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImportJson = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(importJson.trim());
    } catch {
      Alert.alert(t("common.error"), t("personas.importInvalidJson"));
      return;
    }

    // Extract server entries: { name, url, headers }
    let servers: Array<{ name: string; url: string; headers?: Array<{ name: string; value: string }> }> = [];

    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      for (const [key, val] of Object.entries(parsed.mcpServers)) {
        const v = val as Record<string, unknown>;
        const url = (v.url ?? v.endpoint ?? "") as string;
        const hasCommand = !!(v.command || v.args);
        let hdrs: Array<{ name: string; value: string }> | undefined;
        if (v.headers && typeof v.headers === "object") {
          hdrs = Object.entries(v.headers as Record<string, string>).map(([k, vv]) => ({ name: k, value: String(vv) }));
        }
        if (url) {
          servers.push({ name: key, url, headers: hdrs });
        } else if (hasCommand) {
          // Desktop command-based config, skip
        }
      }
      if (servers.length === 0) {
        const isCommandConfig = Object.values(parsed.mcpServers).some(
          (v: any) => v.command || v.args,
        );
        Alert.alert(
          t("common.error"),
          isCommandConfig ? t("personas.importCommandNotSupported") : t("personas.importNoTools"),
        );
        return;
      }
    } else if (Array.isArray(parsed)) {
      servers = parsed
        .map((item: any) => ({ name: item.name ?? "", url: (item.url ?? item.endpoint ?? "") as string }))
        .filter((s: any) => s.url);
    } else if (parsed.url || parsed.endpoint) {
      servers = [{ name: parsed.name ?? "MCP Server", url: (parsed.url ?? parsed.endpoint) as string }];
    }

    if (servers.length === 0) {
      Alert.alert(t("common.error"), t("personas.importNoTools"));
      return;
    }

    setIsImporting(true);
    const addedNames: string[] = [];

    try {
      for (const server of servers) {
        addMcpServer({
          name: server.name,
          url: server.url,
          customHeaders: server.headers,
          enabled: true,
        });
        addedNames.push(server.name);
      }

      setShowImportModal(false);
      setImportJson("");
      Alert.alert(
        t("common.success"),
        t("personas.importSuccess", { count: addedNames.length }) + "\n\n" + addedNames.join("\n"),
      );
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteIdentity = (id: string) => {
    Alert.alert(t("personas.deleteIdentity"), t("common.areYouSure"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeIdentity(id) },
    ]);
  };

  const handleDeleteServer = (id: string) => {
    Alert.alert(t("common.delete"), t("common.areYouSure"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeMcpServer(id) },
    ]);
  };

  return (
    <View className="flex-1 bg-bg-secondary">
      <View className="bg-bg-secondary px-5 pb-4 pt-2">
        <View className="flex-row rounded-xl bg-slate-200/60 p-1">
          {(["identities", "tools"] as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 items-center rounded-lg py-1.5 ${
                activeTab === tab ? "bg-white" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  activeTab === tab ? "text-primary" : "text-slate-500"
                }`}
              >
                {tab === "identities" ? t("personas.identityCards") : t("personas.mcpTools")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 160 }}>
        {activeTab === "identities" ? (
          <View className="gap-4">
            {identities.map((identity, idx) => (
              <IdentityCard
                key={identity.id}
                identity={identity}
                colorIndex={idx}
                onEdit={() =>
                  router.push({
                    pathname: "/(tabs)/discover/identity-edit",
                    params: { id: identity.id },
                  })
                }
                onDelete={() => handleDeleteIdentity(identity.id)}
              />
            ))}
          </View>
        ) : (
          <View className="gap-6">
            {/* Built-in Tools */}
            {builtInTools.length > 0 && (
              <View>
                <Text className="mb-2 px-1 text-[13px] font-medium uppercase tracking-tight text-slate-400">
                  {t("personas.builtInTools")}
                </Text>
                <View className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                  {builtInTools.map((tool, idx) => (
                    <View
                      key={tool.id}
                      className={`flex-row items-center justify-between px-4 py-3 ${idx < builtInTools.length - 1 ? "border-b border-slate-50" : ""}`}
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                          <Ionicons name="phone-portrait-outline" size={18} color="#059669" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[14px] font-semibold text-slate-900">{tool.name}</Text>
                          <Text className="text-[11px] text-slate-400" numberOfLines={1}>{tool.description}</Text>
                        </View>
                      </View>
                      <Switch
                        value={tool.enabled}
                        onValueChange={(v) => updateMcpTool(tool.id, { enabled: v })}
                        trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
                        thumbColor="#fff"
                        ios_backgroundColor="#e5e7eb"
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* MCP Servers */}
            <View>
              <Text className="mb-2 px-1 text-[13px] font-medium uppercase tracking-tight text-slate-400">
                MCP Servers
              </Text>
              {mcpServers.length > 0 ? (
                <View className="gap-3">
                  {mcpServers.map((server) => (
                    <ServerCard
                      key={server.id}
                      server={server}
                      onToggle={(v) => updateMcpServer(server.id, { enabled: v })}
                      onEdit={() =>
                        router.push({
                          pathname: "/(tabs)/discover/tool-edit",
                          params: { id: server.id },
                        })
                      }
                      onDelete={() => handleDeleteServer(server.id)}
                    />
                  ))}
                </View>
              ) : (
                <Text className="px-1 text-[13px] text-slate-400">{t("personas.noCustomTools")}</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View className="absolute bottom-20 left-0 right-0 px-5">
        {activeTab === "identities" ? (
          <Pressable
            onPress={() => router.push("/(tabs)/discover/identity-edit")}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
          >
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text className="text-base font-semibold text-white">{t("personas.createIdentity")}</Text>
          </Pressable>
        ) : (
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setShowImportModal(true)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border-2 border-primary bg-white py-3.5"
            >
              <Ionicons name="code-slash-outline" size={18} color="#007AFF" />
              <Text className="text-[15px] font-semibold text-primary">{t("personas.importJson")}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/discover/tool-edit")}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3.5"
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text className="text-[15px] font-semibold text-white">{t("personas.addTool")}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* JSON Import Modal */}
      <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
            <Pressable onPress={() => { if (!isImporting) { setShowImportModal(false); setImportJson(""); } }}>
              <Text className="text-[16px] text-slate-500">{t("common.cancel")}</Text>
            </Pressable>
            <Text className="text-[16px] font-bold text-slate-900">{t("personas.importJson")}</Text>
            <Pressable onPress={handleImportJson} disabled={isImporting || !importJson.trim()}>
              <Text className={`text-[16px] font-semibold ${isImporting ? "text-slate-400" : "text-primary"}`}>
                {isImporting ? t("common.loading") : t("personas.import")}
              </Text>
            </Pressable>
          </View>
          <View className="flex-1 px-4 pt-4">
            <Text className="mb-2 text-[13px] text-slate-400">{t("personas.importHint")}</Text>
            <TextInput
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[14px] text-slate-800 font-mono"
              value={importJson}
              onChangeText={setImportJson}
              placeholder={'{\n  "mcpServers": {\n    "weather": {\n      "url": "https://..."\n    }\n  }\n}'}
              placeholderTextColor="#cbd5e1"
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function IdentityCard({
  identity,
  colorIndex,
  onEdit,
  onDelete,
}: {
  identity: Identity;
  colorIndex: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const colorSet = ICON_COLORS[colorIndex % ICON_COLORS.length];
  const iconName = IDENTITY_ICONS[colorIndex % IDENTITY_ICONS.length];

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="rounded-xl border border-slate-100 bg-white p-4"
    >
      <View className="flex-row items-start gap-4">
        <View className={`h-12 w-12 items-center justify-center rounded-xl ${colorSet.bg}`}>
          <Ionicons name={iconName} size={24} color={colorSet.color} />
        </View>
        <View className="flex-1">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-text-main" numberOfLines={1}>
              {identity.name}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </View>
          <View className="mb-3 flex-row gap-2">
            <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {t("personas.temp", { value: identity.params.temperature })}
              </Text>
            </View>
            <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {t("personas.tools", { count: identity.mcpToolIds.length })}
              </Text>
            </View>
          </View>
          <Text className="text-sm leading-relaxed text-slate-500" numberOfLines={2}>
            {identity.systemPrompt}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ServerCard({
  server,
  onToggle,
  onEdit,
  onDelete,
}: {
  server: McpServer;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="rounded-xl border border-slate-100 bg-white p-4"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <Ionicons name="cloud-outline" size={20} color="#2563eb" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-slate-900" numberOfLines={1}>
            {server.name}
          </Text>
          <Text className="mt-0.5 text-[11px] text-slate-400" numberOfLines={1}>
            {server.url}
          </Text>
        </View>
        <Switch
          value={server.enabled}
          onValueChange={onToggle}
          trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
          thumbColor="#fff"
          ios_backgroundColor="#e5e7eb"
        />
      </View>
    </Pressable>
  );
}
