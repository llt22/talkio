/**
 * Built-in tools for Tauri v2.
 * Ported from RN version, minus Create Reminder (dropped).
 * Uses web APIs (navigator.clipboard) instead of expo-* modules.
 */

import {
  readWorkspaceFile,
  listWorkspaceDir,
  searchWorkspaceFiles,
  editWorkspaceFile,
  isBinaryPath,
} from "./workspace";
import { gitExecute, isGitWriteCommand } from "./git-tools";
import { appConfirm } from "../components/shared/ConfirmDialogProvider";
import { isDesktop } from "../lib/platform";
import { generateImages, isImageGenerationConfigured } from "./image-generation";
import { persistGeneratedImages } from "./image-store";

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
  /**
   * Stored generated-image references, attached to the assistant message rather
   * than to `content` — `content` becomes a tool message in the conversation
   * history, which is no place for image bytes.
   */
  images?: string[];
}

export interface ToolContext {
  workspaceDir?: string;
}

export interface BuiltInToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context?: ToolContext) => Promise<ToolResult>;
  enabledByDefault?: boolean;
  /** If true, the tool is only available when a workspace is bound */
  requiresWorkspace?: boolean;
  /** If true, the tool is only available on desktop (not on Android/iOS) */
  desktopOnly?: boolean;
  /** If true, the tool is only available once an image endpoint is configured */
  requiresImageConfig?: boolean;
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

function failResult(error: string): ToolResult {
  return { success: false, content: "", error };
}

async function handleGenerateImage(args: Record<string, unknown>): Promise<ToolResult> {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) return failResult("Missing required parameter: prompt");
  const size = typeof args.size === "string" && args.size ? args.size : undefined;
  try {
    const images = await persistGeneratedImages(await generateImages({ prompt, size }));
    return {
      success: true,
      content: `Generated ${images.length} image(s) from the prompt. They are already displayed to the user; do not describe the pixels you cannot see.`,
      images,
    };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "Image generation failed");
  }
}

function requireWorkspaceDir(context?: ToolContext): string | ToolResult {
  const dir = context?.workspaceDir;
  if (!dir) return failResult("No workspace directory bound to this conversation");
  return dir;
}

async function handleReadWorkspaceFile(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const path = typeof args.path === "string" ? args.path : "";
  if (!path) return failResult("Missing required parameter: path");
  if (isBinaryPath(path)) return failResult(`Cannot read binary file: ${path}`);
  try {
    const content = await readWorkspaceFile(ws, path);
    return { success: true, content };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "Failed to read file");
  }
}

async function handleListWorkspaceDir(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const path = typeof args.path === "string" && args.path ? args.path : undefined;
  try {
    const content = await listWorkspaceDir(ws, path);
    return { success: true, content: content || "(empty directory)" };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "Failed to list directory");
  }
}

async function handleSearchWorkspace(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const query = typeof args.query === "string" ? args.query : "";
  if (!query) return failResult("Missing required parameter: query");
  try {
    const content = await searchWorkspaceFiles(ws, query);
    return { success: true, content };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "Search failed");
  }
}

async function handleEditWorkspaceFile(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const path = typeof args.path === "string" ? args.path : "";
  const oldContent = typeof args.old_content === "string" ? args.old_content : "";
  const newContent = typeof args.new_content === "string" ? args.new_content : "";
  if (!path) return failResult("Missing required parameter: path");
  if (!oldContent) return failResult("Missing required parameter: old_content");
  try {
    const result = await editWorkspaceFile(ws, path, oldContent, newContent);
    if (!result.applied) return failResult(result.error || "Edit failed");
    return { success: true, content: `Successfully edited ${result.path}` };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "Edit failed");
  }
}

async function handleGitStatus(
  _args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  try {
    const result = await gitExecute(ws, "status", ["--short", "--branch"]);
    return { success: result.success, content: result.stdout || result.stderr };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "git status failed");
  }
}

async function handleGitDiff(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const diffArgs: string[] = [];
  if (typeof args.staged === "boolean" && args.staged) diffArgs.push("--cached");
  if (typeof args.path === "string" && args.path) diffArgs.push("--", args.path);
  try {
    const result = await gitExecute(ws, "diff", diffArgs);
    const output = result.stdout || "(no changes)";
    return { success: result.success, content: output.slice(0, 8000) };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "git diff failed");
  }
}

async function handleGitLog(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const count = typeof args.count === "number" ? Math.min(args.count, 50) : 10;
  try {
    const result = await gitExecute(ws, "log", [`--oneline`, `-n`, `${count}`, `--no-color`]);
    return { success: result.success, content: result.stdout || result.stderr };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : "git log failed");
  }
}

async function handleGitCommand(
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  const ws = requireWorkspaceDir(context);
  if (typeof ws !== "string") return ws;
  const subcommand = typeof args.subcommand === "string" ? args.subcommand : "";
  if (!subcommand) return failResult("Missing required parameter: subcommand");
  const gitArgs = Array.isArray(args.args)
    ? args.args.filter((a): a is string => typeof a === "string")
    : [];

  // Write commands require user confirmation
  if (isGitWriteCommand(subcommand)) {
    const cmdStr = `git ${subcommand} ${gitArgs.join(" ")}`.trim();
    const ok = await appConfirm({
      title: "Git Operation",
      description: `AI wants to run:\n\n${cmdStr}\n\nAllow this operation?`,
    });
    if (!ok) return failResult("User declined the git operation");
  }

  try {
    const result = await gitExecute(ws, subcommand, gitArgs);
    const output = (result.stdout + (result.stderr ? `\n${result.stderr}` : "")).trim();
    return {
      success: result.success,
      content: output.slice(0, 8000) || (result.success ? "(done)" : "(no output)"),
    };
  } catch (err) {
    return failResult(err instanceof Error ? err.message : `git ${subcommand} failed`);
  }
}

export const BUILT_IN_TOOLS: BuiltInToolDef[] = [
  {
    name: "get_current_time",
    description:
      "Get current date/time. Only call when the user explicitly asks about the current time, date, or timezone.",
    parameters: { type: "object", properties: {} },
    handler: () => handleGetCurrentTime(),
    enabledByDefault: true,
  },
  {
    name: "read_clipboard",
    description:
      "Read clipboard text. Only call when the user explicitly asks to read or paste clipboard content.",
    parameters: { type: "object", properties: {} },
    handler: () => handleReadClipboard(),
    enabledByDefault: true,
  },
  {
    name: "read_workspace_file",
    description:
      "Read the content of a text file from the workspace. The path must be relative to the workspace root. Cannot read binary files (images, archives, etc.).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path within the workspace (e.g. 'src/main.tsx', 'README.md')",
        },
      },
      required: ["path"],
    },
    handler: (args, context) => handleReadWorkspaceFile(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "list_workspace_dir",
    description:
      "List files and subdirectories in a workspace directory. If no path is given, lists the workspace root. Use this to explore the project structure beyond the initial tree.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative directory path within the workspace (e.g. 'src/components'). Omit or leave empty for workspace root.",
        },
      },
    },
    handler: (args, context) => handleListWorkspaceDir(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "search_workspace",
    description:
      "Search for a text pattern across all text files in the workspace (case-insensitive). Returns matching file paths, line numbers, and line content. Use this to find where a function, variable, string, or pattern is used.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text pattern to search for (case-insensitive substring match)",
        },
      },
      required: ["query"],
    },
    handler: (args, context) => handleSearchWorkspace(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "edit_workspace_file",
    description:
      "Edit a text file in the workspace using search/replace. Provide the exact content to find (old_content) and the replacement (new_content). The old_content must match existing file content. Only the first match is replaced. To delete code, set new_content to empty string. Always read the file first with read_workspace_file before editing.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path within the workspace",
        },
        old_content: {
          type: "string",
          description: "Exact content to find in the file (must match existing code)",
        },
        new_content: {
          type: "string",
          description: "Content to replace it with (empty string to delete)",
        },
      },
      required: ["path", "old_content", "new_content"],
    },
    handler: (args, context) => handleEditWorkspaceFile(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using the configured image model. Call this when the user asks for a picture, illustration, logo, or any visual to be created. Write the prompt in English and describe subject, style, composition and lighting. The generated image is shown to the user automatically.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed English description of the image to generate",
        },
        size: {
          type: "string",
          description:
            "Optional image size, e.g. '1024x1024' (square), '1536x1024' (landscape), '1024x1536' (portrait). Omit for the model default.",
        },
      },
      required: ["prompt"],
    },
    handler: (args) => handleGenerateImage(args),
    enabledByDefault: true,
    requiresImageConfig: true,
  },
  // ── Git tools ──
  {
    name: "git_status",
    description:
      "Get the current git status of the workspace (short format with branch info). Use this to check which files are modified, staged, or untracked.",
    parameters: { type: "object", properties: {} },
    handler: (args, context) => handleGitStatus(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "git_diff",
    description:
      "Show git diff of the workspace. By default shows unstaged changes. Set staged=true for staged changes. Optionally specify a file path.",
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "If true, show staged (cached) changes instead of unstaged",
        },
        path: {
          type: "string",
          description: "Optional file path to limit diff to a specific file",
        },
      },
    },
    handler: (args, context) => handleGitDiff(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "git_log",
    description: "Show recent git commit history (oneline format). Default 10 commits, max 50.",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of recent commits to show (default 10, max 50)",
        },
      },
    },
    handler: (args, context) => handleGitLog(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
  {
    name: "git_command",
    description:
      "Execute a git command in the workspace. Read commands (status, log, diff, branch, show, rev-parse, remote) run directly. Write commands (add, commit, checkout, stash, pull, push) require user confirmation. Dangerous operations (force push, hard reset, rebase) are blocked. Use the specific git_status/git_diff/git_log tools when possible; use this for other allowed commands.",
    parameters: {
      type: "object",
      properties: {
        subcommand: {
          type: "string",
          description: "Git subcommand (e.g. 'add', 'commit', 'branch', 'remote')",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Arguments for the git subcommand (e.g. ['-m', 'fix bug'] for commit)",
        },
      },
      required: ["subcommand"],
    },
    handler: (args, context) => handleGitCommand(args, context),
    enabledByDefault: true,
    requiresWorkspace: true,
    desktopOnly: true,
  },
];

/**
 * Execute a built-in tool by name.
 */
export async function executeBuiltInTool(
  name: string,
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult | null> {
  const tool = BUILT_IN_TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  try {
    return await tool.handler(args, context);
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
export function getBuiltInToolDefs(context?: ToolContext) {
  return BUILT_IN_TOOLS.filter(
    (t) =>
      (!t.requiresWorkspace || !!context?.workspaceDir) &&
      (!t.desktopOnly || isDesktop) &&
      (!t.requiresImageConfig || isImageGenerationConfigured()),
  ).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
