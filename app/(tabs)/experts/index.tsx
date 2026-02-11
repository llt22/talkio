import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, Alert, SectionList } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useChatStore } from "../../../src/stores/chat-store";
import { ModelAvatar } from "../../../src/components/common/ModelAvatar";
import type { Model } from "../../../src/types";

export default function ModelsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const models = useProviderStore((s) => s.models);
  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState(false);
  const filtered = enabledModels.filter((m) =>
    searchQuery
      ? m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.modelId.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const sections = groupByProvider(filtered, getProviderById);

  const handleStartChat = useCallback(
    async (model: Model) => {
      if (groupMode) {
        setSelectedForGroup((prev) =>
          prev.includes(model.id)
            ? prev.filter((id) => id !== model.id)
            : [...prev, model.id],
        );
        return;
      }
      const conv = await createConversation("single", [
        { modelId: model.id, identityId: null },
      ]);
      router.push(`/chat/${conv.id}`);
    },
    [groupMode, createConversation, router],
  );

  const handleCreateGroup = useCallback(async () => {
    if (selectedForGroup.length < 2) {
      Alert.alert(t("models.selectModels"), t("models.selectModelsHint"));
      return;
    }
    const participants = selectedForGroup.map((id) => ({
      modelId: id,
      identityId: null,
    }));
    const conv = await createConversation("group", participants);
    setGroupMode(false);
    setSelectedForGroup([]);
    router.push(`/chat/${conv.id}`);
  }, [selectedForGroup, createConversation, router]);

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-1">
        <View className="flex-row items-center rounded-lg bg-ios-gray px-3 py-2">
          <Ionicons name="search" size={18} color="#8E8E93" />
          <TextInput
            className="ml-2 flex-1 text-[15px] text-text-main"
            placeholder={t("common.search")}
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#8E8E93" />
            </Pressable>
          )}
        </View>
      </View>

      {sections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="people-outline" size={48} color="#cbd5e1" />
          <Text className="mt-4 text-lg font-semibold text-text-main">{t("models.noModels")}</Text>
          <Text className="mt-1 text-center text-sm text-slate-400">{t("models.configureHint")}</Text>
          <Pressable
            onPress={() => router.push("/(tabs)/settings/providers")}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5"
          >
            <Text className="text-[15px] font-semibold text-white">{t("models.configureProvider")}</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: groupMode ? 80 : 24 }}
          renderSectionHeader={({ section: { title } }) => (
            <View className="bg-bg-secondary px-5 py-1.5">
              <Text className="text-[13px] font-semibold text-slate-500">
                {title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isSelected = selectedForGroup.includes(item.id);
            const isLast = index === section.data.length - 1;
            return (
              <Pressable
                onPress={() => handleStartChat(item)}
                className={`flex-row items-center bg-white px-5 py-3 ${isSelected ? "bg-blue-50/50" : ""}`}
              >
                <View className="h-10 w-10 overflow-hidden rounded-lg">
                  <ModelAvatar name={item.displayName} size="sm" />
                </View>
                <View className={`ml-3 flex-1 ${!isLast ? "border-b border-slate-100" : ""} pb-3`}>
                  <Text className="text-[16px] font-medium text-text-main" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  <Text className="text-[13px] text-slate-400" numberOfLines={1}>
                    {item.modelId}
                  </Text>
                </View>
                {groupMode ? (
                  <Ionicons
                    name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={isSelected ? "#007AFF" : "#d1d5db"}
                  />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                )}
              </Pressable>
            );
          }}
        />
      )}

      {!groupMode && (
        <View className="absolute bottom-24 right-5">
          <Pressable
            onPress={() => {
              setGroupMode(true);
              setSelectedForGroup([]);
            }}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary"
          >
            <Ionicons name="chatbubbles" size={22} color="#fff" />
          </Pressable>
        </View>
      )}

      {groupMode && (
        <View className="absolute bottom-4 left-5 right-5">
          {selectedForGroup.length >= 2 ? (
            <Pressable
              onPress={handleCreateGroup}
              className="items-center rounded-xl bg-primary py-3.5"
            >
              <Text className="text-base font-semibold text-white">
                {t("models.createGroup", { count: selectedForGroup.length })}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                setGroupMode(false);
                setSelectedForGroup([]);
              }}
              className="items-center rounded-xl bg-slate-200 py-3.5"
            >
              <Text className="text-base font-medium text-slate-600">{t("common.cancel")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function groupByProvider(
  models: Model[],
  getProviderById: (id: string) => { name: string } | undefined,
): Array<{ title: string; data: Model[] }> {
  const map = new Map<string, { title: string; data: Model[] }>();
  for (const m of models) {
    const provider = getProviderById(m.providerId);
    const name = provider?.name ?? "Unknown";
    if (!map.has(name)) {
      map.set(name, { title: name, data: [] });
    }
    map.get(name)!.data.push(m);
  }
  return Array.from(map.values());
}
