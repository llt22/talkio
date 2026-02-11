import { View, Text, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1 bg-bg-secondary">
      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <View className="flex-row items-center">
          <Ionicons name="shield-checkmark" size={24} color="#2b2bee" />
          <Text className="ml-2 text-base font-semibold text-text-main">{t("privacy.privacyFirst")}</Text>
        </View>
        <Text className="mt-2 text-sm leading-5 text-text-muted">
          {t("privacy.privacyDesc")}
        </Text>
      </View>

      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <Text className="mb-3 text-sm font-semibold text-text-main">{t("privacy.dataStorage")}</Text>
        <PrivacyItem
          icon="phone-portrait-outline"
          title={t("privacy.localOnly")}
          description={t("privacy.localOnlyDesc")}
        />
        <PrivacyItem
          icon="key-outline"
          title={t("privacy.apiKeySecurity")}
          description={t("privacy.apiKeyDesc")}
        />
        <PrivacyItem
          icon="cloud-offline-outline"
          title={t("privacy.noCloud")}
          description={t("privacy.noCloudDesc")}
        />
      </View>

      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <Text className="mb-3 text-sm font-semibold text-text-main">{t("privacy.permissions")}</Text>
        <PrivacyItem
          icon="mic-outline"
          title={t("privacy.microphone")}
          description={t("privacy.microphoneDesc")}
        />
        <PrivacyItem
          icon="camera-outline"
          title={t("privacy.camera")}
          description={t("privacy.cameraDesc")}
        />
        <PrivacyItem
          icon="images-outline"
          title={t("privacy.photoLibrary")}
          description={t("privacy.photoLibraryDesc")}
        />
      </View>

      <View className="mx-4 mb-8 mt-4 rounded-xl bg-white p-4">
        <Text className="mb-3 text-sm font-semibold text-text-main">{t("privacy.dataManagement")}</Text>
        <Text className="text-sm leading-5 text-text-muted">
          {t("privacy.dataManagementDesc")}
        </Text>
      </View>
    </ScrollView>
  );
}

function PrivacyItem({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View className="mb-3 flex-row">
      <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
        <Ionicons name={icon} size={16} color="#2b2bee" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-medium text-text-main">{title}</Text>
        <Text className="mt-0.5 text-xs leading-4 text-text-muted">{description}</Text>
      </View>
    </View>
  );
}
