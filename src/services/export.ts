import type { Conversation, Message } from "../types";
import { saveOrShareFile } from "./file-download";

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
  await saveOrShareFile(filename, markdown, {
    mimeType: "text/markdown",
    filterName: "Markdown",
    filterExtensions: ["md"],
  });
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

/**
 * Export conversation as a styled HTML file (can be opened in browser and printed to PDF).
 */
export async function exportConversationAsPdf(args: {
  conversation: Conversation;
  messages: Message[];
  titleFallback: string;
  youLabel: string;
  thoughtProcessLabel: string;
}) {
  const title = args.conversation.title || args.titleFallback;
  const date = new Date(args.conversation.createdAt).toLocaleDateString();

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let messagesHtml = "";
  for (const msg of args.messages) {
    const name = msg.role === "user" ? args.youLabel : (msg.senderName ?? "AI");
    const time = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isUser = msg.role === "user";
    const content = msg.content ? escapeHtml(msg.content).replace(/\n/g, "<br>") : "";
    const reasoning = msg.reasoningContent
      ? `<details open><summary>${escapeHtml(args.thoughtProcessLabel)}</summary><div class="reasoning">${escapeHtml(msg.reasoningContent).replace(/\n/g, "<br>")}</div></details>`
      : "";

    messagesHtml += `
      <div class="message ${isUser ? "user" : "assistant"}">
        <div class="meta">
          <span class="name" ${!isUser ? 'style="color:#2563eb"' : ""}>${escapeHtml(name)}</span>
          <span class="time">${time}</span>
        </div>
        ${reasoning}
        <div class="content">${content}</div>
      </div>
      <hr>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1a1a1a; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .date { color: #888; font-size: 12px; margin-bottom: 16px; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 12px 0; }
  .message { margin: 8px 0; }
  .meta { margin-bottom: 4px; }
  .name { font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
  .time { color: #aaa; font-size: 11px; margin-left: 8px; }
  .content { white-space: pre-wrap; word-break: break-word; }
  .user .content { text-align: right; }
  .reasoning { color: #888; font-size: 12px; margin: 4px 0 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
  details summary { cursor: pointer; color: #888; font-size: 12px; margin-bottom: 4px; }
  @media print { body { padding: 12px; } }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <div class="date">${date}</div>
  <hr>
  ${messagesHtml}
</body></html>`;

  const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50)}.html`;
  await saveOrShareFile(filename, html, {
    mimeType: "text/html",
    filterName: "HTML",
    filterExtensions: ["html"],
  });
}
