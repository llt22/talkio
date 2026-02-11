import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";

export default function ProvidersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const removeProvider = useProviderStore((s) => s.removeProvider);

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
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: "/(tabs)/settings/provider-edit", params: { id: p.id } })}
            onLongPress={() => handleDelete(p.id, p.name)}
            className="mx-4 mt-3 rounded-xl bg-white p-4"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                  <Text className="text-sm font-bold text-primary">{p.name.slice(0, 2)}</Text>
                </View>
                <View className="ml-3">
                  <Text className="text-base font-semibold text-text-main">{p.name}</Text>
                  <Text className="text-xs text-text-muted">{p.baseUrl}</Text>
                </View>
              </View>
              <Text className={`text-xs font-medium capitalize ${statusColor}`}>{p.status === "connected" ? t("providerEdit.connectionSuccessful") : p.status}</Text>
            </View>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-xs text-text-muted">
                {t("providers.modelsCount", { total: providerModels.length, active: providerModels.filter((m) => m.enabled).length })}
              </Text>
              <Text className="text-xs text-text-hint">{p.type}</Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => router.push("/(tabs)/settings/provider-edit")}
        className="mx-4 mt-4 mb-8 items-center rounded-xl border border-dashed border-border-light bg-white py-6"
      >
        <Ionicons name="add-circle-outline" size={28} color="#2b2bee" />
        <Text className="mt-1 text-sm font-medium text-primary">{t("providers.addProvider")}</Text>
      </Pressable>
    </ScrollView>
  );
}
