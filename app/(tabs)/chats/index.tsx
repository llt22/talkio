import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useChatStore } from "../../../src/stores/chat-store";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { ModelAvatar } from "../../../src/components/common/ModelAvatar";
import { CapabilityTag } from "../../../src/components/common/CapabilityTag";
import { EmptyState } from "../../../src/components/common/EmptyState";
import type { Conversation } from "../../../src/types";

type FilterType = "all" | "single" | "group";

export default function ChatsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const conversations = useChatStore((s) => s.conversations);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowSearch((v) => !v)}
            className="p-1"
          >
            <Ionicons name="search" size={22} color="#007AFF" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/experts")}
            className="p-1"
          >
            <Ionicons name="create-outline" size={22} color="#007AFF" />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, router]);

  const filtered = conversations.filter((c) => {
    if (filter === "single" && c.type !== "single") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (searchQuery) {
      return c.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert("Delete Chat", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteConversation(id) },
      ]);
    },
    [deleteConversation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const firstModel = getModelById(item.participants[0]?.modelId);
      const modelName = firstModel?.displayName ?? "Unknown";
      const identity = item.participants[0]?.identityId
        ? getIdentityById(item.participants[0].identityId)
        : null;

      return (
        <Pressable
          onPress={() => router.push(`/(tabs)/chats/${item.id}`)}
          onLongPress={() => handleDelete(item.id)}
          className="flex-row items-center gap-4 rounded-2xl px-3 py-3"
        >
          <View className="relative">
            <View className="h-14 w-14 overflow-hidden rounded-full">
              <ModelAvatar name={modelName} size="lg" />
            </View>
            {firstModel && (
              <View className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-accent-green" />
            )}
          </View>
          <View className="flex-1 border-b border-divider pb-3">
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-1 flex-row items-center gap-1.5">
                <Text className="text-[16px] font-semibold text-text-main" numberOfLines={1}>
                  {item.type === "group" ? item.title : modelName}
                </Text>
                {firstModel?.capabilities.reasoning && (
                  <View className="rounded bg-blue-50 px-1.5 py-0.5">
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">Reasoning</Text>
                  </View>
                )}
                {firstModel?.capabilities.vision && (
                  <View className="rounded bg-orange-100 px-1.5 py-0.5">
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-orange-600">Vision</Text>
                  </View>
                )}
              </View>
              <Text className="ml-2 text-xs text-text-hint">
                {formatDate(item.updatedAt)}
              </Text>
            </View>
            <Text className="text-sm text-text-hint" numberOfLines={1}>
              {identity ? `${identity.name}: ` : ""}
              {item.lastMessage ?? "Start a conversation"}
            </Text>
          </View>
        </Pressable>
      );
    },
    [getModelById, getIdentityById, router, handleDelete],
  );

  return (
    <View className="flex-1 bg-white">
      {showSearch && (
        <View className="px-4 pb-2">
          <View className="flex-row items-center rounded-xl bg-ios-gray px-3 py-2">
            <Ionicons name="search" size={18} color="#94a3b8" />
            <TextInput
              className="ml-2 flex-1 text-[15px] text-text-main"
              placeholder="Search chats..."
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color="#94a3b8" />
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View className="px-4 pb-3">
        <View className="flex-row gap-2">
          {(["all", "single", "group"] as FilterType[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 ${
                filter === f ? "bg-primary" : "bg-divider"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  filter === f ? "text-white" : "text-text-main"
                }`}
              >
                {f === "all" ? "All" : f === "single" ? "Experts" : "Groups"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          description="Go to Experts tab to start chatting with a model"
        />
      ) : (
        <FlashList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
        />
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
