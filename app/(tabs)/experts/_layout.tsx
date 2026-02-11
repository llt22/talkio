import { Stack } from "expo-router";

export default function ExpertsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Experts",
          headerLargeTitle: true,
          headerLargeStyle: { backgroundColor: "#ffffff" },
          headerStyle: { backgroundColor: "#ffffff" },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="[id]" options={{ headerBackTitle: "Experts" }} />
    </Stack>
  );
}
