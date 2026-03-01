import type { Conversation, Message } from "../types";

export function buildConversationMarkdown(args: {
  title: string;
  createdAt: string;
  messages: Message[];
  youLabel: string;
  thoughtProcessLabel: string;
  exportedFooter?: string;
}): string {
  const { title, createdAt, messages, youLabel, thoughtProcessLabel, exportedFooter } = args;

  const date = new Date(createdAt).toLocaleDateString();
  let md = `# ${title}\n\n> ${date}\n\n---\n\n`;

  for (const msg of messages) {
    const name = msg.role === "user" ? youLabel : (msg.senderName ?? "AI");
    const time = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    md += `### ${name}  \`${time}\`\n\n`;
    if (msg.reasoningContent) {
      md += `<details>\n<summary>${thoughtProcessLabel}</summary>\n\n${msg.reasoningContent}\n\n</details>\n\n`;
    }
    if (msg.content) md += `${msg.content}\n\n`;
    md += `---\n\n`;
  }

  if (exportedFooter) md += `\n${exportedFooter}\n`;
  return md;
}

export async function downloadMarkdownFile(filenameBase: string, markdown: string) {
  const filename = `${filenameBase.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50)}.md`;

  // Tauri: mobile share or desktop save dialog
  if ((window as any).__TAURI_INTERNALS__) {
    // Mobile (Android/iOS): share .md file via native bridge
    const nativeShare = (window as any).NativeShare;
    if (nativeShare) {
      try {
        nativeShare.shareFile(filename, markdown, "text/markdown");
        return;
      } catch {
        // fall through to save dialog
      }
    }
    // Desktop Tauri: save dialog
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: filename,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) await writeTextFile(filePath, markdown);
      return;
    } catch {
      // Fallback to browser download
    }
  }

  // Browser fallback
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportConversationAsMarkdown(args: {
  conversation: Conversation;
  messages: Message[];
  titleFallback: string;
  youLabel: string;
  thoughtProcessLabel: string;
  exportedFooter?: string;
}) {
  const title = args.conversation.title || args.titleFallback;
  const md = buildConversationMarkdown({
    title,
    createdAt: args.conversation.createdAt,
    messages: args.messages,
    youLabel: args.youLabel,
    thoughtProcessLabel: args.thoughtProcessLabel,
    exportedFooter: args.exportedFooter,
  });
  downloadMarkdownFile(title, md);
}
