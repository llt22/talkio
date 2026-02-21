import "../src/polyfills";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useProviderStore } from "../src/stores/provider-store";
import { useIdentityStore } from "../src/stores/identity-store";
import { useSettingsStore } from "../src/stores/settings-store";
import { hydrateStorage } from "../src/storage/mmkv";
import { initDatabase } from "../src/storage/database";
import "../src/i18n";
import "../global.css";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const loadIdentities = useIdentityStore((s) => s.loadIdentities);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    Promise.all([hydrateStorage(), initDatabase()]).then(() => {
      loadProviders();
      loadIdentities();
      useIdentityStore.getState().initBuiltInTools();
      loadSettings();
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chat/[id]"
            options={{
              headerShown: true,
              headerBackTitle: "Back",
              headerShadowVisible: false,
              headerStyle: { backgroundColor: "#ffffff" },
              animation: "ios_from_right",
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
              gestureDirection: "horizontal",
              headerTitleAlign: "center",
            }}
          />
        </Stack>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
