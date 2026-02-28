/**
 * Built-in tools for Tauri v2.
 * Ported from RN version, minus Create Reminder (dropped).
 * Uses web APIs (navigator.clipboard) instead of expo-* modules.
 */

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface BuiltInToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  enabledByDefault?: boolean;
}

async function handleGetCurrentTime(): Promise<ToolResult> {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    success: true,
    content: JSON.stringify({
      date: now.toLocaleDateString("en-CA"),
      time: now.toLocaleTimeString("en-US", { hour12: false }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffset: `UTC${now.getTimezoneOffset() > 0 ? "-" : "+"}${Math.abs(now.getTimezoneOffset() / 60)}`,
      dayOfWeek: days[now.getDay()],
      timestamp: now.toISOString(),
    }),
  };
}

async function handleReadClipboard(): Promise<ToolResult> {
  try {
    const text = await navigator.clipboard.readText();
    return { success: true, content: text || "(clipboard is empty)" };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Failed to read clipboard",
    };
  }
}

export const BUILT_IN_TOOLS: BuiltInToolDef[] = [
  {
    name: "get_current_time",
    description: "Get current date/time. Only call when the user explicitly asks about the current time, date, or timezone.",
    parameters: { type: "object", properties: {} },
    handler: () => handleGetCurrentTime(),
    enabledByDefault: true,
  },
  {
    name: "read_clipboard",
    description: "Read clipboard text. Only call when the user explicitly asks to read or paste clipboard content.",
    parameters: { type: "object", properties: {} },
    handler: () => handleReadClipboard(),
    enabledByDefault: true,
  },
];

/**
 * Execute a built-in tool by name.
 */
export async function executeBuiltInTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  const tool = BUILT_IN_TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  try {
    return await tool.handler(args);
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}

/**
 * Get tool definitions formatted for the OpenAI API tools parameter.
 */
export function getBuiltInToolDefs() {
  return BUILT_IN_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
