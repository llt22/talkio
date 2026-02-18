import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t("settings.title"),
          headerLargeTitle: true,
          headerLargeStyle: { backgroundColor: "#F2F2F7" },
          headerStyle: { backgroundColor: "#F2F2F7" },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="providers" options={{ title: t("layout.providers") }} />
      <Stack.Screen name="provider-edit" options={{ title: t("layout.addProvider"), presentation: "modal" }} />
      <Stack.Screen name="privacy" options={{ title: t("layout.privacy") }} />
      <Stack.Screen name="web-config" options={{ title: t("layout.webConfig") }} />
    </Stack>
  );
}
