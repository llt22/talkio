import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, SectionList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useProviderStore } from "../../stores/provider-store";
import { useThemeColors } from "../../hooks/useThemeColors";
import { ModelAvatar } from "../common/ModelAvatar";
import type { Model } from "../../types";

interface ModelPickerModalProps {
  visible: boolean;
  excludeModelIds: string[];
  onSelect: (modelId: string) => void;
  onClose: () => void;
  title?: string;
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
  for (const section of map.values()) {
    section.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export const ModelPickerModal = React.memo(function ModelPickerModal({
  visible,
  excludeModelIds,
  onSelect,
  onClose,
  title,
}: ModelPickerModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const models = useProviderStore((s) => s.models);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    const excludeSet = new Set(excludeModelIds);
    return models
      .filter((m) => m.enabled && !excludeSet.has(m.id))
      .filter((m) =>
        search
          ? m.displayName.toLowerCase().includes(search.toLowerCase()) ||
            m.modelId.toLowerCase().includes(search.toLowerCase())
          : true,
      );
  }, [models, excludeModelIds, search]);

  const sections = useMemo(() => groupByProvider(available, getProviderById), [available, getProviderById]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between border-b border-border-light px-4 py-3">
          <Pressable onPress={onClose} hitSlop={8} className="active:opacity-60" style={{ width: 60 }}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text className="text-base font-semibold text-text-main">{title ?? t("chat.addMember")}</Text>
          <View style={{ width: 60 }} />
        </View>

        <View className="px-4 py-2">
          <View className="flex-row items-center rounded-xl bg-bg-input px-3 py-2">
            <Ionicons name="search" size={18} color={colors.searchIcon} />
            <TextInput
              className="ml-2 flex-1 text-[15px] text-text-main"
              placeholder={t("common.search")}
              placeholderTextColor={colors.textHint}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} className="active:opacity-60">
                <Ionicons name="close-circle" size={18} color={colors.searchIcon} />
              </Pressable>
            )}
          </View>
        </View>

        {sections.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-sm text-text-hint">{t("chat.noAvailableModels")}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            renderSectionHeader={({ section: { title: sectionTitle } }) => (
              <View className="bg-bg-secondary px-5 py-1.5">
                <Text className="text-[13px] font-semibold text-section-header">
                  {sectionTitle}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
                android_ripple={{ color: "rgba(0,0,0,0.06)" }}
                className="flex-row items-center gap-4 border-b border-divider bg-bg-light px-4 py-3 active:bg-bg-hover"
              >
                <View className="h-10 w-10 overflow-hidden rounded-lg">
                  <ModelAvatar name={item.displayName} size="sm" />
                </View>
                <View className="flex-1">
                  <Text className="text-[16px] font-medium text-text-main" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  <Text className="text-[13px] text-text-hint" numberOfLines={1}>
                    {item.modelId}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
});
