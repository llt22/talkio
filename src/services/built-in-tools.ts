import { Platform } from "react-native";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import * as Clipboard from "expo-clipboard";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import * as Brightness from "expo-brightness";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { registerLocalTool, type McpExecutionResult } from "./mcp-client";
import type { McpTool } from "../types";

// ── Built-in tool definitions ──

export const BUILT_IN_TOOLS: Omit<McpTool, "id">[] = [
  {
    name: "Get Current Time",
    type: "local",
    scope: "global",
    description: "Returns current date, time, timezone, and day of week",
    endpoint: null,
    nativeModule: "get_current_time",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "get_current_time",
      description: "Get current date, time, timezone, and day of week",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    name: "Get Device Info",
    type: "local",
    scope: "global",
    description: "Returns device platform, OS version, model, and battery/network status",
    endpoint: null,
    nativeModule: "get_device_info",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "get_device_info",
      description: "Get device platform, OS version, model, battery level, and network status",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    name: "Read Clipboard",
    type: "local",
    scope: "global",
    description: "Read current text content from the device clipboard",
    endpoint: null,
    nativeModule: "read_clipboard",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "read_clipboard",
      description: "Read the current text content from the device clipboard",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    name: "Create Reminder",
    type: "local",
    scope: "global",
    description: "Create a calendar event with an alarm reminder on the device",
    endpoint: null,
    nativeModule: "create_reminder",
    permissions: ["calendar"],
    enabled: false,
    builtIn: true,
    schema: {
      name: "create_reminder",
      description: "Create a calendar event with an alarm reminder. Use ISO 8601 format for dates.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          date: { type: "string", description: "Event date/time in ISO 8601 format, e.g. 2025-03-15T09:00:00" },
          notes: { type: "string", description: "Optional notes for the event" },
          alarm_minutes_before: { type: "number", description: "Minutes before event to trigger alarm (default: 5)" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    name: "Get Location",
    type: "local",
    scope: "global",
    description: "Get the device's current GPS location (latitude, longitude, altitude)",
    endpoint: null,
    nativeModule: "get_location",
    permissions: ["location"],
    enabled: false,
    builtIn: true,
    schema: {
      name: "get_location",
      description: "Get the device's current GPS location coordinates",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    name: "Open Link",
    type: "local",
    scope: "global",
    description: "Open a URL, navigate to an address in Maps, or make a phone call",
    endpoint: null,
    nativeModule: "open_link",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "open_link",
      description: "Open a URL in browser, navigate to address in Maps (use maps: or geo: scheme), or dial a phone number (use tel: scheme)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to open. Examples: https://..., tel:+1234567890, maps:?q=Starbucks" },
        },
        required: ["url"],
      },
    },
  },
  {
    name: "Set Brightness",
    type: "local",
    scope: "global",
    description: "Adjust the screen brightness level (0.0 to 1.0)",
    endpoint: null,
    nativeModule: "set_brightness",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "set_brightness",
      description: "Set screen brightness. 0.0 = darkest, 1.0 = brightest, 0.5 = medium",
      parameters: {
        type: "object",
        properties: {
          level: { type: "number", description: "Brightness level from 0.0 to 1.0" },
        },
        required: ["level"],
      },
    },
  },
  {
    name: "Share Text",
    type: "local",
    scope: "global",
    description: "Share text content to other apps via the system share sheet",
    endpoint: null,
    nativeModule: "share_text",
    permissions: [],
    enabled: false,
    builtIn: true,
    schema: {
      name: "share_text",
      description: "Share text content to other apps (WeChat, Notes, Mail, etc.) via the system share sheet",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text content to share" },
        },
        required: ["text"],
      },
    },
  },
];

// ── Handler implementations ──

async function handleGetCurrentTime(): Promise<McpExecutionResult> {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    success: true,
    content: JSON.stringify({
      date: now.toLocaleDateString("en-CA"), // YYYY-MM-DD
      time: now.toLocaleTimeString("en-US", { hour12: false }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffset: `UTC${now.getTimezoneOffset() > 0 ? "-" : "+"}${Math.abs(now.getTimezoneOffset() / 60)}`,
      dayOfWeek: days[now.getDay()],
      timestamp: now.toISOString(),
    }),
  };
}

async function handleGetDeviceInfo(): Promise<McpExecutionResult> {
  let batteryLevel: number | null = null;
  let networkType = "unknown";

  try {
    batteryLevel = await Battery.getBatteryLevelAsync();
    batteryLevel = Math.round(batteryLevel * 100);
  } catch { /* not available */ }

  try {
    const state = await Network.getNetworkStateAsync();
    networkType = state.type ?? "unknown";
  } catch { /* not available */ }

  return {
    success: true,
    content: JSON.stringify({
      platform: Platform.OS,
      osVersion: Platform.Version,
      batteryLevel: batteryLevel !== null ? `${batteryLevel}%` : "unknown",
      networkType,
    }),
  };
}

async function handleReadClipboard(): Promise<McpExecutionResult> {
  try {
    const text = await Clipboard.getStringAsync();
    return {
      success: true,
      content: text || "(clipboard is empty)",
    };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to read clipboard",
    };
  }
}

async function handleCreateReminder(args: Record<string, unknown>): Promise<McpExecutionResult> {
  const title = args.title as string;
  const dateStr = args.date as string;
  const notes = (args.notes as string) ?? "";
  const alarmMinutes = (args.alarm_minutes_before as number) ?? 5;

  if (!title || !dateStr) {
    return { success: false, content: "", error: "title and date are required" };
  }

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      return { success: false, content: "", error: "Calendar permission denied" };
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
    if (!defaultCal) {
      return { success: false, content: "", error: "No writable calendar found" };
    }

    const startDate = new Date(dateStr);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 min duration

    const eventId = await Calendar.createEventAsync(defaultCal.id, {
      title,
      startDate,
      endDate,
      notes,
      alarms: [{ relativeOffset: -alarmMinutes }],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    return {
      success: true,
      content: JSON.stringify({
        eventId,
        title,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        calendar: defaultCal.title,
        alarmMinutesBefore: alarmMinutes,
      }),
    };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to create reminder",
    };
  }
}

async function handleGetLocation(): Promise<McpExecutionResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { success: false, content: "", error: "Location permission denied" };
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    let address = "unknown";
    try {
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo) {
        address = [geo.street, geo.district, geo.city, geo.region, geo.country]
          .filter(Boolean)
          .join(", ");
      }
    } catch { /* reverse geocode not available */ }

    return {
      success: true,
      content: JSON.stringify({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        accuracy: loc.coords.accuracy,
        address,
      }),
    };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to get location",
    };
  }
}

async function handleOpenLink(args: Record<string, unknown>): Promise<McpExecutionResult> {
  const url = args.url as string;
  if (!url) {
    return { success: false, content: "", error: "url is required" };
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      return { success: false, content: "", error: `Cannot open URL: ${url}` };
    }
    await Linking.openURL(url);
    return { success: true, content: `Opened: ${url}` };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to open URL",
    };
  }
}

async function handleSetBrightness(args: Record<string, unknown>): Promise<McpExecutionResult> {
  const level = args.level as number;
  if (level === undefined || level < 0 || level > 1) {
    return { success: false, content: "", error: "level must be between 0.0 and 1.0" };
  }

  try {
    await Brightness.setBrightnessAsync(level);
    return {
      success: true,
      content: JSON.stringify({ brightness: level, percent: `${Math.round(level * 100)}%` }),
    };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to set brightness",
    };
  }
}

async function handleShareText(args: Record<string, unknown>): Promise<McpExecutionResult> {
  const text = args.text as string;
  if (!text) {
    return { success: false, content: "", error: "text is required" };
  }

  try {
    // Write text to a temp file for sharing
    const tmpPath = `${FileSystem.cacheDirectory}share_${Date.now()}.txt`;
    await FileSystem.writeAsStringAsync(tmpPath, text);
    await Sharing.shareAsync(tmpPath, { mimeType: "text/plain", dialogTitle: "Share" });
    return { success: true, content: "Share dialog opened" };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to share",
    };
  }
}

// ── Registration ──

const HANDLER_MAP: Record<string, (args: Record<string, unknown>) => Promise<McpExecutionResult>> = {
  get_current_time: () => handleGetCurrentTime(),
  get_device_info: () => handleGetDeviceInfo(),
  read_clipboard: () => handleReadClipboard(),
  create_reminder: handleCreateReminder,
  get_location: () => handleGetLocation(),
  open_link: handleOpenLink,
  set_brightness: handleSetBrightness,
  share_text: handleShareText,
};

export function registerBuiltInTools(toolIds: Map<string, string>): void {
  for (const [nativeModule, toolId] of toolIds.entries()) {
    const handler = HANDLER_MAP[nativeModule];
    if (handler) {
      registerLocalTool(toolId, (args) => handler(args));
    }
  }
}
