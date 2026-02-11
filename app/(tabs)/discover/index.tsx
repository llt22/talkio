import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIdentityStore } from "../../../src/stores/identity-store";
import type { Identity, McpTool } from "../../../src/types";

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
  const identities = useIdentityStore((s) => s.identities);
  const mcpTools = useIdentityStore((s) => s.mcpTools);
  const removeIdentity = useIdentityStore((s) => s.removeIdentity);
  const removeMcpTool = useIdentityStore((s) => s.removeMcpTool);
  const [activeTab, setActiveTab] = useState<Tab>("identities");

  const handleDeleteIdentity = (id: string) => {
    Alert.alert(t("discover.deleteIdentity"), t("common.areYouSure"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeIdentity(id) },
    ]);
  };

  const handleDeleteTool = (id: string) => {
    Alert.alert(t("discover.deleteTool"), t("common.areYouSure"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeMcpTool(id) },
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
                {tab === "identities" ? t("discover.identityCards") : t("discover.mcpTools")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
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
          <View className="gap-4">
            {mcpTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onEdit={() =>
                  router.push({
                    pathname: "/(tabs)/discover/tool-edit",
                    params: { id: tool.id },
                  })
                }
                onDelete={() => handleDeleteTool(tool.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View className="absolute bottom-20 left-0 right-0 px-5">
        <Pressable
          onPress={() =>
            router.push(
              activeTab === "identities"
                ? "/(tabs)/discover/identity-edit"
                : "/(tabs)/discover/tool-edit",
            )
          }
          className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text className="text-base font-semibold text-white">
            {activeTab === "identities" ? t("discover.createIdentity") : t("discover.addTool")}
          </Text>
        </Pressable>
      </View>
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
                {t("discover.temp", { value: identity.params.temperature })}
              </Text>
            </View>
            <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {t("discover.tools", { count: identity.mcpToolIds.length })}
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

function ToolCard({
  tool,
  onEdit,
  onDelete,
}: {
  tool: McpTool;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isLocal = tool.type === "local";

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="rounded-xl border border-slate-100 bg-white p-4"
    >
      <View className="flex-row items-start gap-4">
        <View
          className={`h-12 w-12 items-center justify-center rounded-xl ${
            isLocal ? "bg-emerald-100" : "bg-blue-100"
          }`}
        >
          <Ionicons
            name={isLocal ? "phone-portrait-outline" : "cloud-outline"}
            size={24}
            color={isLocal ? "#059669" : "#2563eb"}
          />
        </View>
        <View className="flex-1">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-text-main" numberOfLines={1}>
              {tool.name}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </View>
          <View className="mb-3 flex-row gap-2">
            <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {tool.type}
              </Text>
            </View>
            <View className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {tool.scope}
              </Text>
            </View>
            <View className={`rounded px-2 py-0.5 ${tool.enabled ? "bg-primary/10" : "bg-slate-100"}`}>
              <Text className={`text-[10px] font-bold uppercase tracking-wider ${tool.enabled ? "text-primary" : "text-slate-500"}`}>
                {tool.enabled ? t("common.enabled") : t("common.disabled")}
              </Text>
            </View>
          </View>
          <Text className="text-sm leading-relaxed text-slate-500" numberOfLines={1}>
            {tool.description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
