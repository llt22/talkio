import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, Alert, AppState } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useProviderStore } from "../../../src/stores/provider-store";
import {
  startConfigServer,
  stopConfigServer,
  type ProviderConfig,
} from "../../../src/services/config-server";

export default function WebConfigScreen() {
  const { t } = useTranslation();
  const addProvider = useProviderStore((s) => s.addProvider);
  const testConnection = useProviderStore((s) => s.testConnection);

  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopConfigServer();
    };
  }, []);

  const handleStart = useCallback(async () => {
    const handleConfig = async (config: ProviderConfig) => {
      const provider = addProvider({
        name: config.name,
        type: "official",
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      await testConnection(provider.id);
      if (mountedRef.current) {
        setReceivedCount((c) => c + 1);
        Alert.alert(
          t("webConfig.providerAdded"),
          t("webConfig.providerAddedDetail", { name: config.name }),
        );
      }
    };

    try {
      const url = await startConfigServer(handleConfig);
      if (mountedRef.current) setServerUrl(url);
    } catch (err) {
      Alert.alert(
        t("common.error"),
        err instanceof Error ? err.message : "Failed to start server",
      );
    }
  }, [addProvider, testConnection, t]);

  return (
    <View className="flex-1 bg-bg-secondary">
      <View className="flex-1 items-center justify-center px-8">
        {serverUrl ? (
          <>
            <View className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
              <QRCode value={serverUrl} size={200} />
            </View>

            <Text className="mb-2 text-center text-lg font-bold text-text-main">
              {t("webConfig.scanOrVisit")}
            </Text>

            <View className="mb-6 rounded-xl bg-white px-5 py-3">
              <Text className="text-center text-base font-mono font-semibold text-primary">
                {serverUrl}
              </Text>
            </View>

            <Text className="mb-2 text-center text-sm text-text-muted">
              {t("webConfig.instructions")}
            </Text>

            {receivedCount > 0 && (
              <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-green-50 px-4 py-3">
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <Text className="text-sm font-medium text-green-700">
                  {t("webConfig.received", { count: receivedCount })}
                </Text>
              </View>
            )}

            <View className="mt-8 flex-row items-center gap-2 rounded-xl bg-blue-50 px-4 py-3">
              <Ionicons name="shield-checkmark-outline" size={16} color="#3b82f6" />
              <Text className="flex-1 text-xs text-blue-600">
                {t("webConfig.securityNote")}
              </Text>
            </View>
          </>
        ) : (
          <View className="items-center">
            <Ionicons name="laptop-outline" size={48} color="#8b5cf6" />
            <Text className="mt-4 text-center text-lg font-bold text-text-main">
              {t("webConfig.scanOrVisit")}
            </Text>
            <Text className="mt-2 mb-6 text-center text-sm text-text-muted">
              {t("webConfig.instructions")}
            </Text>
            <Pressable
              onPress={handleStart}
              className="rounded-xl bg-primary px-8 py-3.5"
            >
              <Text className="text-base font-semibold text-white">
                {t("webConfig.startServer")}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
