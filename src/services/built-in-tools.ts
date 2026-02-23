import * as Clipboard from "expo-clipboard";
import * as Calendar from "expo-calendar";
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

// ── Registration ──

const HANDLER_MAP: Record<string, (args: Record<string, unknown>) => Promise<McpExecutionResult>> = {
  get_current_time: () => handleGetCurrentTime(),
  read_clipboard: () => handleReadClipboard(),
  create_reminder: handleCreateReminder,
};

export function registerBuiltInTools(toolIds: Map<string, string>): void {
  for (const [nativeModule, toolId] of toolIds.entries()) {
    const handler = HANDLER_MAP[nativeModule];
    if (handler) {
      registerLocalTool(toolId, (args) => handler(args));
    }
  }
}
