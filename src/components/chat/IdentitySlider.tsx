import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIdentityStore } from "../../stores/identity-store";

interface IdentitySliderProps {
  visible: boolean;
  activeIdentityId: string | null;
  onSelect: (identityId: string | null) => void;
}

export const IdentitySlider = React.memo(function IdentitySlider({
  visible,
  activeIdentityId,
  onSelect,
}: IdentitySliderProps) {
  const identities = useIdentityStore((s) => s.identities);

  if (!visible) return null;

  return (
    <View className="w-full pb-4 pt-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {activeIdentityId && (
          <Pressable
            onPress={() => onSelect(null)}
            className="w-[160px] flex-shrink-0 items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 active:opacity-80"
          >
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-red-100">
              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
            </View>
            <View>
              <Text className="text-xs font-bold text-red-500">Remove</Text>
              <Text className="text-[10px] leading-tight text-red-400">Clear identity</Text>
            </View>
          </Pressable>
        )}

        {identities.map((identity) => {
          const isActive = identity.id === activeIdentityId;
          return (
            <Pressable
              key={identity.id}
              onPress={() => onSelect(identity.id)}
              className={`w-[160px] flex-shrink-0 items-start gap-2 rounded-2xl border p-3 active:opacity-80 ${
                isActive
                  ? "border-primary/20 bg-primary/5"
                  : "border-border-light bg-white"
              }`}
            >
              <View
                className={`h-8 w-8 items-center justify-center rounded-lg ${
                  isActive ? "bg-primary" : "bg-slate-100"
                }`}
              >
                <Ionicons
                  name={getIconName(identity.icon)}
                  size={18}
                  color={isActive ? "#fff" : "#64748b"}
                />
              </View>
              <View>
                <Text
                  className={`text-xs font-bold ${
                    isActive ? "text-primary" : "text-text-main"
                  }`}
                  numberOfLines={1}
                >
                  {identity.name}
                </Text>
                <Text className="text-[10px] leading-tight text-text-muted" numberOfLines={2}>
                  {identity.systemPrompt.slice(0, 60)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

function getIconName(icon: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    code: "code-slash-outline",
    translate: "language-outline",
    architecture: "git-network-outline",
    security: "shield-checkmark-outline",
    finance: "cash-outline",
    writing: "create-outline",
    research: "search-outline",
    marketing: "megaphone-outline",
    design: "color-palette-outline",
    general: "sparkles-outline",
  };
  return iconMap[icon] ?? "sparkles-outline";
}
