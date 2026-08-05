/**
 * Git tool service — invokes the Rust `git_execute` Tauri command.
 * Only available on desktop (non-Android).
 */
import { invoke } from "@tauri-apps/api/core";

export interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  is_write: boolean;
}

const READ_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "branch",
  "show",
  "rev-parse",
  "remote",
]);

const WRITE_SUBCOMMANDS = new Set(["add", "commit", "checkout", "stash", "pull", "push"]);

export function isGitReadCommand(subcommand: string): boolean {
  return READ_SUBCOMMANDS.has(subcommand);
}

export function isGitWriteCommand(subcommand: string): boolean {
  return WRITE_SUBCOMMANDS.has(subcommand);
}

export async function gitExecute(
  cwd: string,
  subcommand: string,
  args: string[] = [],
): Promise<GitResult> {
  return invoke<GitResult>("git_execute", { cwd, subcommand, args });
}
