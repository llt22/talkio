import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useProviderStore } from "../../../src/stores/provider-store";
import {
  startConfigServer,
  stopConfigServer,
  getPairingCode,
  type ProviderConfig,
} from "../../../src/services/config-server";

export default function WebConfigScreen() {
  const { t } = useTranslation();
  const addProviderWithTest = useProviderStore((s) => s.addProviderWithTest);

  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);

  const handleStart = async () => {
    if (serverUrl) {
      stopConfigServer();
      setServerUrl(null);
      return;
    }

    const onConfig = async (config: ProviderConfig) => {
      const result = await addProviderWithTest({
        name: config.name,
        type: "openai",
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      
      if (result.success) {
        setReceivedCount((c) => c + 1);
        Alert.alert(
          t("webConfig.providerAdded"),
          t("webConfig.providerAddedDetail", { name: config.name }),
        );
      } else {
        Alert.alert(
          t("common.error"),
          t("providerEdit.connectionFailed"),
        );
      }
    };

    try {
      const url = await startConfigServer(onConfig);
      setServerUrl(url);
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg-secondary">
      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <View className="flex-row items-center">
          <Ionicons name="laptop-outline" size={24} color="#8b5cf6" />
          <Text className="ml-2 text-base font-semibold text-text-main">
            {t("webConfig.scanOrVisit")}
          </Text>
        </View>
        <Text className="mt-2 text-sm leading-5 text-text-muted">
          {t("webConfig.instructions")}
        </Text>
      </View>

      <View className="mx-4 mt-4 rounded-xl bg-white p-4">
        <Pressable
          onPress={handleStart}
          className={`items-center rounded-lg py-3 ${serverUrl ? "bg-red-500" : "bg-primary"}`}
        >
          <Text className="text-base font-semibold text-white">
            {serverUrl ? t("webConfig.stopServer") : t("webConfig.startServer")}
          </Text>
        </Pressable>

        {serverUrl && (
          <View className="mt-4 rounded-lg bg-slate-50 p-4">
            <Text className="text-center text-sm text-text-muted">
              {t("webConfig.visitUrl")}
            </Text>
            <Text className="mt-2 text-center text-lg font-bold text-primary">
              {serverUrl}
            </Text>
            {serverUrl.includes("0.0.0.0") && (
              <Text className="mt-2 text-center text-xs text-amber-600">
                {t("webConfig.ipNotDetected")}
              </Text>
            )}
            {getPairingCode() && (
              <View className="mt-3 rounded-lg bg-violet-50 p-3">
                <Text className="text-center text-xs text-text-muted">
                  {t("webConfig.pairingCodeLabel")}
                </Text>
                <Text className="mt-1 text-center text-2xl font-bold tracking-widest text-violet-600">
                  {getPairingCode()}
                </Text>
              </View>
            )}
          </View>
        )}

        {receivedCount > 0 && (
          <View className="mt-3 flex-row items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text className="text-sm font-medium text-green-700">
              {t("webConfig.received", { count: receivedCount })}
            </Text>
          </View>
        )}
      </View>

      <View className="mx-4 mt-4 mb-8 rounded-xl bg-white p-4">
        <View className="flex-row items-center">
          <Ionicons name="shield-checkmark-outline" size={18} color="#3b82f6" />
          <Text className="ml-2 text-sm text-blue-600">
            {t("webConfig.securityNote")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
