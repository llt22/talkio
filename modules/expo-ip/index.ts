import { Platform } from "react-native";

let ExpoIpModule: { getWifiIP(): string } | null = null;
if (Platform.OS === "android") {
  try {
    ExpoIpModule = require("expo-modules-core").requireNativeModule("ExpoIp");
  } catch {}
}

export function getWifiIP(): string {
  if (ExpoIpModule) return ExpoIpModule.getWifiIP();
  return "0.0.0.0";
}
