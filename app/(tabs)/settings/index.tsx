import { View, Text, Pressable, ScrollView, Switch, Platform, ActionSheetIOS, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useSettingsStore } from "../../../src/stores/settings-store";
import { shareBackup, restoreBackup } from "../../../src/services/backup-service";
import { useChatStore } from "../../../src/stores/chat-store";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useProviderStore((s) => s.providers);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <ScrollView className="flex-1 bg-bg-secondary">
      <View className="px-5 mb-8 pt-2">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.configuration")}
        </Text>
        <View
          className="overflow-hidden rounded-xl border border-slate-100 bg-white"
        >
          <SettingsRow
            icon="git-network-outline"
            iconBg="bg-blue-500/10"
            iconColor="#3b82f6"
            label={t("settings.providers")}
            detail={t("common.configured", { count: providers.length })}
            onPress={() => router.push("/(tabs)/settings/providers")}
          />
          <SettingsRow
            icon="lock-closed-outline"
            iconBg="bg-green-500/10"
            iconColor="#22c55e"
            label={t("settings.privacyPermissions")}
            onPress={() => router.push("/(tabs)/settings/privacy")}
          />
          <SettingsRow
            icon="laptop-outline"
            iconBg="bg-violet-500/10"
            iconColor="#8b5cf6"
            label={t("settings.webConfig")}
            onPress={() => router.push("/(tabs)/settings/web-config")}
          />
          <SettingsRow
            icon="language-outline"
            iconBg="bg-indigo-500/10"
            iconColor="#6366f1"
            label={t("settings.languageSetting")}
            detail={settings.language === "system" ? t("settings.langSystem") : settings.language === "zh" ? t("settings.langZh") : t("settings.langEn")}
            onPress={() => {
              const options = [t("common.cancel"), t("settings.langSystem"), t("settings.langEn"), t("settings.langZh")];
              const values: Array<"system" | "en" | "zh"> = ["system", "system", "en", "zh"];
              if (Platform.OS === "ios") {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options, cancelButtonIndex: 0 },
                  (idx) => { if (idx > 0) updateSettings({ language: values[idx] }); },
                );
              } else {
                updateSettings({ language: settings.language === "en" ? "zh" : settings.language === "zh" ? "system" : "en" });
              }
            }}
            isLast
          />
        </View>
      </View>

      <View className="px-5 mb-8">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.interactions")}
        </Text>
        <View
          className="overflow-hidden rounded-xl border border-slate-100 bg-white"
        >
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-gray-500/10">
                <Ionicons name="hand-left-outline" size={16} color="#6b7280" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.hapticFeedback")}</Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(v) => updateSettings({ hapticFeedback: v })}
              trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
              thumbColor="#fff"
              ios_backgroundColor="#e5e7eb"
            />
          </View>
        </View>
      </View>

      <View className="px-5 mb-8">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.dataManagement")}
        </Text>
        <View className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <Pressable
            onPress={async () => {
              try {
                await shareBackup();
              } catch (err) {
                Alert.alert(t("common.error"), err instanceof Error ? err.message : "Export failed");
              }
            }}
            className="flex-row items-center justify-between p-4 border-b border-slate-50"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                <Ionicons name="download-outline" size={16} color="#14b8a6" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.exportBackup")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </Pressable>
          <Pressable
            onPress={async () => {
              try {
                const result = await DocumentPicker.getDocumentAsync({ type: "application/json" });
                if (result.canceled || !result.assets?.[0]) return;
                const uri = result.assets[0].uri;
                const response = await fetch(uri);
                const jsonContent = await response.text();
                const stats = await restoreBackup(jsonContent);
                await useChatStore.getState().loadConversations();
                Alert.alert(
                  t("settings.restoreSuccess"),
                  t("settings.restoreDetail", { conversations: stats.conversations, messages: stats.messages }),
                );
              } catch (err) {
                Alert.alert(t("common.error"), err instanceof Error ? err.message : "Import failed");
              }
            }}
            className="flex-row items-center justify-between p-4"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Ionicons name="push-outline" size={16} color="#f59e0b" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.importBackup")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </Pressable>
        </View>
      </View>

      <View className="px-8 mt-4">
        <View className="rounded-xl border border-blue-100/50 bg-blue-50/50 p-4 mb-6">
          <Text className="text-center text-xs leading-relaxed text-slate-500">
            <Ionicons name="shield-checkmark" size={10} color="#6b7280" /> {t("settings.securityTip")}
          </Text>
        </View>
        <View className="items-center pb-6">
          <Text className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
            {t("settings.appName")}
          </Text>
          <Text className="mt-1 text-xs text-slate-400">v0.1.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SettingsRow({
  icon,
  iconBg,
  iconColor,
  label,
  detail,
  onPress,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  detail?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between p-4 ${!isLast ? "border-b border-slate-50" : ""}`}
    >
      <View className="flex-row items-center">
        <View className={`mr-3 h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text className="text-[15px] font-medium text-text-main">{label}</Text>
      </View>
      <View className="flex-row items-center">
        {detail && <Text className="mr-2 text-sm text-slate-400">{detail}</Text>}
        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
      </View>
    </Pressable>
  );
}
