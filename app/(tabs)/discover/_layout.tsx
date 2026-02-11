import { Stack } from "expo-router";

export default function DiscoverLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Discover",
          headerLargeTitle: true,
          headerLargeStyle: { backgroundColor: "#ffffff" },
          headerStyle: { backgroundColor: "#ffffff" },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="identity-edit" options={{ title: "Edit Identity", presentation: "modal" }} />
      <Stack.Screen name="tool-edit" options={{ title: "Edit Tool", presentation: "modal" }} />
    </Stack>
  );
}
