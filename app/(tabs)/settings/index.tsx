import { View, Text, Pressable, ScrollView, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useSettingsStore } from "../../../src/stores/settings-store";

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
            icon="sync-outline"
            iconBg="bg-orange-500/10"
            iconColor="#f97316"
            label={t("settings.dataSync")}
            detail={settings.syncEnabled ? t("common.enabled") : t("common.off")}
            onPress={() => router.push("/(tabs)/settings/sync")}
          />
          <SettingsRow
            icon="lock-closed-outline"
            iconBg="bg-green-500/10"
            iconColor="#22c55e"
            label={t("settings.privacyPermissions")}
            onPress={() => router.push("/(tabs)/settings/privacy")}
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
          <View className="flex-row items-center justify-between p-4 border-b border-slate-50">
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-gray-500/10">
                <Ionicons name="hand-left-outline" size={16} color="#6b7280" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.hapticFeedback")}</Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(v) => updateSettings({ hapticFeedback: v })}
              trackColor={{ true: "#007AFF" }}
            />
          </View>
          <View className="flex-row items-center justify-between p-4 border-b border-slate-50">
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                <Ionicons name="flash-outline" size={16} color="#a855f7" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.quickPrompts")}</Text>
            </View>
            <Switch
              value={settings.quickPromptEnabled}
              onValueChange={(v) => updateSettings({ quickPromptEnabled: v })}
              trackColor={{ true: "#007AFF" }}
            />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                <Ionicons name="mic-outline" size={16} color="#ef4444" />
              </View>
              <Text className="text-[15px] font-medium text-text-main">{t("settings.voiceAutoTranscribe")}</Text>
            </View>
            <Switch
              value={settings.voiceAutoTranscribe}
              onValueChange={(v) => updateSettings({ voiceAutoTranscribe: v })}
              trackColor={{ true: "#007AFF" }}
            />
          </View>
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
