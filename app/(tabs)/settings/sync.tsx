import { View, Text, TextInput, Pressable, Switch, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "../../../src/stores/settings-store";

export default function SyncScreen() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleTestWebdav = () => {
    if (!settings.webdavUrl) {
      Alert.alert(t("common.error"), t("sync.enterUrlFirst"));
      return;
    }
    Alert.alert("WebDAV", t("sync.notImplemented"));
  };

  return (
    <View className="flex-1 bg-bg-secondary">
      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-text-main">{t("sync.enableSync")}</Text>
          <Switch
            value={settings.syncEnabled}
            onValueChange={(v) => updateSettings({ syncEnabled: v })}
            trackColor={{ false: "#e5e7eb", true: "#007AFF" }}
            thumbColor="#fff"
            ios_backgroundColor="#e5e7eb"
          />
        </View>
        <Text className="mt-1 text-xs text-text-muted">
          {t("sync.syncDesc")}
        </Text>
      </View>

      {settings.syncEnabled && (
        <View className="mx-4 mt-4 rounded-xl bg-white p-4">
          <Text className="mb-3 text-sm font-semibold text-text-main">{t("sync.webdavSettings")}</Text>
          <View className="mb-3">
            <Text className="mb-1 text-xs text-text-muted">{t("sync.serverUrl")}</Text>
            <TextInput
              className="rounded-lg border border-border-light bg-bg-secondary px-3 py-2.5 text-sm text-text-main"
              value={settings.webdavUrl ?? ""}
              onChangeText={(v) => updateSettings({ webdavUrl: v || null })}
              placeholder="https://dav.example.com/avatar/"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
          <View className="mb-3">
            <Text className="mb-1 text-xs text-text-muted">{t("sync.username")}</Text>
            <TextInput
              className="rounded-lg border border-border-light bg-bg-secondary px-3 py-2.5 text-sm text-text-main"
              value={settings.webdavUser ?? ""}
              onChangeText={(v) => updateSettings({ webdavUser: v || null })}
              placeholder="user"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
            />
          </View>
          <View className="mb-3">
            <Text className="mb-1 text-xs text-text-muted">{t("sync.password")}</Text>
            <TextInput
              className="rounded-lg border border-border-light bg-bg-secondary px-3 py-2.5 text-sm text-text-main"
              value={settings.webdavPass ?? ""}
              onChangeText={(v) => updateSettings({ webdavPass: v || null })}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />
          </View>
          <Pressable
            onPress={handleTestWebdav}
            className="items-center rounded-xl bg-primary py-3"
          >
            <Text className="text-sm font-semibold text-white">{t("sync.testConnection")}</Text>
          </Pressable>
        </View>
      )}

      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <Text className="mb-2 text-sm font-semibold text-text-main">{t("sync.qrSync")}</Text>
        <Text className="text-xs text-text-muted">
          {t("sync.qrDesc")}
        </Text>
        <Pressable className="mt-3 flex-row items-center justify-center rounded-xl border border-border-light py-3">
          <Ionicons name="qr-code-outline" size={20} color="#2b2bee" />
          <Text className="ml-2 text-sm font-medium text-primary">{t("sync.scanQr")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
