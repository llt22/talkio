import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, SectionList } from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useChatStore } from "../../../src/stores/chat-store";
import { ModelAvatar } from "../../../src/components/common/ModelAvatar";
import { EmptyState } from "../../../src/components/common/EmptyState";
import type { Model } from "../../../src/types";

export default function ModelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.getEnabledModels);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push("/(tabs)/settings/providers")}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="add" size={22} color="#007AFF" />
          <Text className="text-base font-medium text-primary">Add</Text>
        </Pressable>
      ),
    });
  }, [navigation, router]);

  const enabledModels = models();
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

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pb-2 pt-1">
        <View className="flex-row items-center rounded-lg bg-ios-gray px-3 py-2">
          <Ionicons name="search" size={18} color="#8E8E93" />
          <TextInput
            className="ml-2 flex-1 text-[15px] text-text-main"
            placeholder="Search"
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
        <EmptyState
          icon="people-outline"
          title="No models available"
          description="Add a provider to get started"
        />
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
                Create Group ({selectedForGroup.length})
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
              <Text className="text-base font-medium text-slate-600">Cancel</Text>
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
