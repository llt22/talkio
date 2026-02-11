import { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useChatStore } from "../../../src/stores/chat-store";
import { ModelAvatar } from "../../../src/components/common/ModelAvatar";
import { CapabilityTag } from "../../../src/components/common/CapabilityTag";
import { EmptyState } from "../../../src/components/common/EmptyState";
import type { Model } from "../../../src/types";

export default function ExpertsScreen() {
  const router = useRouter();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.getEnabledModels);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState(false);

  const enabledModels = models();
  const filtered = enabledModels.filter((m) =>
    searchQuery
      ? m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.modelId.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const groupedModels = groupByCapability(filtered);

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
      router.push(`/(tabs)/chats/${conv.id}`);
    },
    [groupMode, createConversation, router],
  );

  const handleCreateGroup = useCallback(async () => {
    if (selectedForGroup.length < 2) {
      Alert.alert("Select Models", "Pick at least 2 models for a group chat.");
      return;
    }
    const participants = selectedForGroup.map((id) => ({
      modelId: id,
      identityId: null,
    }));
    const conv = await createConversation("group", participants);
    setGroupMode(false);
    setSelectedForGroup([]);
    router.push(`/(tabs)/chats/${conv.id}`);
  }, [selectedForGroup, createConversation, router]);

  const renderModelItem = useCallback(
    ({ item }: { item: Model }) => {
      const provider = getProviderById(item.providerId);
      const isSelected = selectedForGroup.includes(item.id);

      return (
        <Pressable
          onPress={() => handleStartChat(item)}
          className={`mx-4 mb-2 flex-row items-center rounded-xl border bg-white px-4 py-3 ${
            isSelected ? "border-primary bg-primary-light" : "border-border-light"
          }`}
        >
          <ModelAvatar name={item.displayName} size="md" online />
          <View className="ml-3 flex-1">
            <View className="flex-row items-center">
              <Text className="text-base font-semibold text-text-main">
                {item.displayName}
              </Text>
              {item.capabilitiesVerified && (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="#2b2bee"
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
            <Text className="text-xs text-text-muted">
              {provider?.name ?? "Unknown"} · {item.modelId}
            </Text>
            <View className="mt-1 flex-row flex-wrap gap-1">
              {item.capabilities.reasoning && (
                <CapabilityTag label="Reasoning" type="reasoning" />
              )}
              {item.capabilities.vision && (
                <CapabilityTag label="Vision" type="vision" />
              )}
              {item.capabilities.toolCall && (
                <CapabilityTag label="Tools" type="tools" />
              )}
            </View>
          </View>
          {groupMode && (
            <View className="ml-2">
              <Ionicons
                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={isSelected ? "#2b2bee" : "#d1d5db"}
              />
            </View>
          )}
          {!groupMode && (
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          )}
        </Pressable>
      );
    },
    [getProviderById, handleStartChat, groupMode, selectedForGroup],
  );

  return (
    <View className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-3">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-3xl font-bold tracking-tight text-black">Experts</Text>
          <Pressable
            onPress={() => router.push("/(tabs)/settings/providers")}
            className="flex-row items-center gap-1"
          >
            <Ionicons name="add" size={20} color="#007AFF" />
            <Text className="text-base font-medium text-primary">Add</Text>
          </Pressable>
        </View>
        <View className="relative">
          <View className="absolute left-3 top-1/2 z-10" style={{ transform: [{ translateY: -9 }] }}>
            <Ionicons name="search" size={18} color="#94a3b8" />
          </View>
          <TextInput
            className="w-full rounded-xl border-0 bg-ios-gray py-2 pl-10 pr-4 text-[17px] text-text-main"
            placeholder="Search"
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View className="mt-2 px-5">
        <Text className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Active Providers
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pb-2">
          <View className="flex-row gap-5">
            {providers.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push("/(tabs)/settings/providers")}
                className="items-center gap-1.5"
              >
                <View
                  className="h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white"
                  style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
                >
                  <Text className="text-lg font-bold text-text-main">
                    {p.name.slice(0, 2)}
                  </Text>
                </View>
                <Text className="text-[11px] font-medium text-slate-600">{p.name}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => router.push("/(tabs)/settings/providers")}
              className="items-center gap-1.5"
            >
              <View className="h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-ios-gray/50">
                <Ionicons name="add" size={20} color="#94a3b8" />
              </View>
              <Text className="text-[11px] font-medium text-slate-400">Add</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <ScrollView className="flex-1 mt-4 px-5" showsVerticalScrollIndicator={false}>
        {Array.from(groupedModels.entries()).map(([group, groupModels]) => (
          <View key={group} className="mb-6">
            <Text className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-tight text-slate-500">
              {group === "Reasoning" ? "Reasoning Experts" : group === "Multimodal" ? "Multimodal & Creative" : "General Purpose"}
            </Text>
            <View
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white"
              style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
            >
              {groupModels.map((item, idx) => {
                const provider = getProviderById(item.providerId);
                const isSelected = selectedForGroup.includes(item.id);
                const isLast = idx === groupModels.length - 1;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleStartChat(item)}
                    className={`flex-row items-center gap-4 p-4 ${!isLast ? "border-b border-slate-50" : ""} ${isSelected ? "bg-blue-50/50" : ""}`}
                  >
                    <View className="relative">
                      <View className="h-12 w-12 overflow-hidden rounded-xl">
                        <ModelAvatar name={item.displayName} size="md" />
                      </View>
                      {item.capabilitiesVerified && (
                        <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent-green" />
                      )}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[17px] font-semibold text-slate-900" numberOfLines={1}>
                          {item.displayName}
                        </Text>
                        {item.capabilitiesVerified && (
                          <Ionicons name="checkmark-circle" size={16} color="#007AFF" />
                        )}
                      </View>
                      <View className="mt-1 flex-row gap-1.5">
                        {item.capabilities.reasoning && (
                          <View className="rounded bg-tag-reasoning px-2 py-0.5">
                            <Text className="text-[10px] font-semibold text-tag-reasoning-text">Reasoning</Text>
                          </View>
                        )}
                        {item.capabilities.vision && (
                          <View className="rounded bg-tag-vision px-2 py-0.5">
                            <Text className="text-[10px] font-semibold text-tag-vision-text">Vision</Text>
                          </View>
                        )}
                        {item.capabilities.toolCall && (
                          <View className="rounded bg-tag-tools px-2 py-0.5">
                            <Text className="text-[10px] font-semibold text-tag-tools-text">Tools</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {groupMode ? (
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                        size={24}
                        color={isSelected ? "#007AFF" : "#d1d5db"}
                      />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {!groupMode && (
        <View className="absolute bottom-24 right-6">
          <Pressable
            onPress={() => {
              setGroupMode(true);
              setSelectedForGroup([]);
            }}
            className="h-14 w-14 items-center justify-center rounded-full bg-primary"
            style={{ shadowColor: "#007AFF", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
          >
            <Ionicons name="chatbubbles" size={24} color="#fff" />
          </Pressable>
        </View>
      )}

      {groupMode && (
        <View className="absolute bottom-4 left-5 right-5">
          {selectedForGroup.length >= 2 ? (
            <Pressable
              onPress={handleCreateGroup}
              className="items-center rounded-2xl bg-primary py-4"
              style={{ shadowColor: "#007AFF", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
            >
              <Text className="text-base font-semibold text-white">
                Create Group Chat ({selectedForGroup.length} models)
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                setGroupMode(false);
                setSelectedForGroup([]);
              }}
              className="items-center rounded-2xl bg-slate-200 py-4"
            >
              <Text className="text-base font-medium text-slate-600">Cancel</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function groupByCapability(models: Model[]): Map<string, Model[]> {
  const groups = new Map<string, Model[]>();
  for (const m of models) {
    const key = m.capabilities.reasoning
      ? "Reasoning"
      : m.capabilities.vision
        ? "Multimodal"
        : "General";
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return groups;
}
