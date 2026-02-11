import "../src/polyfills";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useProviderStore } from "../src/stores/provider-store";
import { useIdentityStore } from "../src/stores/identity-store";
import { useSettingsStore } from "../src/stores/settings-store";
import { useChatStore } from "../src/stores/chat-store";
import { hydrateStorage } from "../src/storage/mmkv";
import { initDatabase } from "../src/storage/database";
import "../src/i18n";
import "../global.css";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const loadIdentities = useIdentityStore((s) => s.loadIdentities);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    Promise.all([hydrateStorage(), initDatabase()]).then(() => {
      loadProviders();
      loadIdentities();
      loadSettings();
      loadConversations();
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
