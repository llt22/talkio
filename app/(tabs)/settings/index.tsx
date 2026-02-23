import { View, Text, Pressable, ScrollView, Switch, Platform, ActionSheetIOS, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { useSettingsStore } from "../../../src/stores/settings-store";
import { useThemeColors } from "../../../src/hooks/useThemeColors";
import { shareBackup, restoreBackup } from "../../../src/services/backup-service";


export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useProviderStore((s) => s.providers);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const colors = useThemeColors();

  return (
    <ScrollView className="flex-1 bg-bg-secondary">
      <View className="px-5 mb-8 pt-2">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-section-header">
          {t("settings.configuration")}
        </Text>
        <View
          className="overflow-hidden rounded-xl bg-bg-card"
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
          />
          <SettingsRow
            icon="moon-outline"
            iconBg="bg-slate-500/10"
            iconColor="#64748b"
            label={t("settings.theme", { defaultValue: "Theme" })}
            detail={
              settings.theme === "system"
                ? t("settings.themeSystem", { defaultValue: "System" })
                : settings.theme === "dark"
                  ? t("settings.themeDark", { defaultValue: "Dark" })
                  : t("settings.themeLight", { defaultValue: "Light" })
            }
            onPress={() => {
              const options = [
                t("common.cancel"),
                t("settings.themeSystem", { defaultValue: "System" }),
                t("settings.themeLight", { defaultValue: "Light" }),
                t("settings.themeDark", { defaultValue: "Dark" }),
              ];
              const values: Array<"system" | "light" | "dark"> = ["system", "system", "light", "dark"];
              if (Platform.OS === "ios") {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options, cancelButtonIndex: 0 },
                  (idx) => { if (idx > 0) updateSettings({ theme: values[idx] }); },
                );
              } else {
                updateSettings({
                  theme: settings.theme === "light" ? "dark" : settings.theme === "dark" ? "system" : "light",
                });
              }
            }}
            isLast
          />
        </View>
      </View>

      <View className="px-5 mb-8">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-section-header">
          {t("settings.interactions")}
        </Text>
        <View
          className="overflow-hidden rounded-xl bg-bg-card"
        >
          <View className="flex-row items-center justify-between p-4 border-b border-border-subtle">
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-text-muted/10">
                <Ionicons name="hand-left-outline" size={16} color={colors.textSecondary} />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.hapticFeedback")}</Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(v) => updateSettings({ hapticFeedback: v })}
              trackColor={{ false: colors.switchTrack, true: colors.accent }}
              thumbColor="#fff"
              ios_backgroundColor={colors.switchTrack}
            />
          </View>
          <SettingsRow
            icon="mic-outline"
            iconBg="bg-orange-500/10"
            iconColor="#f97316"
            label={t("settings.sttProvider")}
            detail={settings.sttApiKey ? settings.sttModel : t("settings.sttNotConfigured")}
            onPress={() => router.push("/(tabs)/settings/stt")}
          />
        </View>
      </View>

      <View className="px-5 mb-8">
        <Text className="mb-2 ml-2 text-xs font-semibold uppercase tracking-wider text-section-header">
          {t("settings.dataManagement")}
        </Text>
        <View className="overflow-hidden rounded-xl bg-bg-card">
          <Pressable
            onPress={async () => {
              try {
                await shareBackup();
              } catch (err) {
                Alert.alert(t("common.error"), err instanceof Error ? err.message : "Export failed");
              }
            }}
            className="flex-row items-center justify-between p-4 border-b border-border-subtle active:bg-bg-hover"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                <Ionicons name="download-outline" size={16} color="#14b8a6" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.exportBackup")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.chevron} />
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
                // Reload all stores from MMKV after restore
                useProviderStore.getState().loadProviders();
                useIdentityStore.getState().loadIdentities();
                useIdentityStore.getState().initBuiltInTools();
                useSettingsStore.getState().loadSettings();
                Alert.alert(
                  t("settings.restoreSuccess"),
                  t("settings.restoreDetail", { conversations: stats.conversations, messages: stats.messages }),
                );
              } catch (err) {
                Alert.alert(t("common.error"), err instanceof Error ? err.message : "Import failed");
              }
            }}
            className="flex-row items-center justify-between p-4 active:bg-bg-hover"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Ionicons name="push-outline" size={16} color="#f59e0b" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.importBackup")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.chevron} />
          </Pressable>
        </View>
      </View>

      <View className="px-8 mt-4">
        <View className="rounded-xl border border-primary/10 bg-primary/5 p-4 mb-6">
          <Text className="text-center text-xs leading-relaxed text-text-muted">
            <Ionicons name="shield-checkmark" size={10} color={colors.textSecondary} /> {t("settings.securityTip")}
          </Text>
        </View>
        <View className="items-center pb-6">
          <Text className="text-[10px] font-medium uppercase tracking-widest text-text-hint">
            {t("settings.appName")}
          </Text>
          <Text className="mt-1 text-xs text-text-hint">v0.1.0</Text>
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
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between p-4 active:bg-bg-hover ${!isLast ? "border-b border-border-subtle" : ""}`}
    >
      <View className="flex-row items-center">
        <View className={`mr-3 h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text className="text-[15px] font-medium text-text-main">{label}</Text>
      </View>
      <View className="flex-row items-center">
        {detail && <Text className="mr-2 text-sm text-text-hint">{detail}</Text>}
        <Ionicons name="chevron-forward" size={16} color={colors.chevron} />
      </View>
    </Pressable>
  );
}
