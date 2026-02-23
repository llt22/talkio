import { View, Text, Pressable, ScrollView, Alert, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useThemeColors } from "../../../src/hooks/useThemeColors";

export default function ProvidersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const colors = useThemeColors();

  const handleDelete = (id: string, name: string) => {
    Alert.alert(t("providers.deleteProvider"), t("providers.deleteConfirm", { name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeProvider(id) },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-bg-secondary">
      {providers.map((p) => {
        const providerModels = models.filter((m) => m.providerId === p.id);
        const statusColor =
          p.status === "connected" ? "text-success" : p.status === "error" ? "text-error" : "text-text-hint";

        return (
          <Swipeable
            key={p.id}
            renderRightActions={(_progress, dragX) => {
              const scale = dragX.interpolate({
                inputRange: [-80, 0],
                outputRange: [1, 0.5],
                extrapolate: "clamp",
              });
              return (
                <Pressable
                  onPress={() => handleDelete(p.id, p.name)}
                  style={{
                    width: 80,
                    backgroundColor: colors.danger,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                  }}
                >
                  <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                    <Text className="mt-0.5 text-[10px] font-medium text-white">{t("common.delete")}</Text>
                  </Animated.View>
                </Pressable>
              );
            }}
            overshootRight={false}
            friction={2}
          >
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/settings/provider-edit", params: { id: p.id } })}
              android_ripple={{ color: "rgba(0,0,0,0.06)" }}
              className={`mx-4 mt-3 rounded-xl bg-bg-card p-4 active:opacity-80 ${p.enabled === false ? "opacity-50" : ""}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <View className={`h-10 w-10 items-center justify-center rounded-lg ${p.enabled === false ? "bg-bg-input" : "bg-primary-light"}`}>
                    <Text className={`text-sm font-bold ${p.enabled === false ? "text-text-hint" : "text-primary"}`}>{p.name.slice(0, 2)}</Text>
                  </View>
                  <View className="ml-3 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-text-main" numberOfLines={1}>{p.name}</Text>
                      {p.enabled === false && (
                        <View className="rounded bg-bg-input px-1.5 py-0.5">
                          <Text className="text-[10px] font-medium text-text-hint">{t("common.disabled")}</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-text-muted" numberOfLines={1}>{p.baseUrl}</Text>
                  </View>
                </View>
                <Text className={`text-xs font-medium capitalize ${statusColor}`}>{p.status === "connected" ? t("providerEdit.connectionSuccessful") : p.status}</Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-text-muted">
                  {t("providers.modelsCount", { total: providerModels.length, active: providerModels.filter((m) => m.enabled).length })}
                </Text>
                <View className="rounded bg-bg-input px-2 py-0.5">
                  <Text className="text-[11px] font-medium text-text-muted">{p.type}</Text>
                </View>
              </View>
            </Pressable>
          </Swipeable>
        );
      })}

      <Pressable
        onPress={() => router.push("/(tabs)/settings/provider-edit")}
        className="mx-4 mt-4 mb-8 items-center rounded-xl border border-dashed border-border-light bg-bg-card py-6 active:opacity-60"
      >
        <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
        <Text className="mt-1 text-sm font-medium text-primary">{t("providers.addProvider")}</Text>
      </Pressable>
    </ScrollView>
  );
}
