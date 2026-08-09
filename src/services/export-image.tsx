import { createRoot } from "react-dom/client";
import type { Conversation, Message } from "../types";
import { MarkdownRenderer } from "../components/shared/MarkdownRenderer";
import { saveOrShareBlobs } from "./file-download";

const EXPORT_WIDTH = 900;
const MAX_SLICE_HEIGHT = 8000;
const SCALE = 1.5;

export async function exportConversationAsImages(args: {
  conversation: Conversation;
  messages: Message[];
  titleFallback: string;
  youLabel: string;
  thoughtProcessLabel: string;
}): Promise<number> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${EXPORT_WIDTH}px;z-index:-1;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(<ConversationImageDocument {...args} />);
    const documentElement = await waitForElement(host, "[data-conversation-export]");
    await waitForAssets(documentElement);

    const height = Math.ceil(documentElement.getBoundingClientRect().height);
    const pageCount = Math.max(1, Math.ceil(height / MAX_SLICE_HEIGHT));
    const filenameBase = sanitizeFilename(args.conversation.title || args.titleFallback);
    const fileOptions = {
      mimeType: "image/png",
      filterName: "PNG",
      filterExtensions: ["png"],
    };
    const shouldBatch = pageCount > 1 && !!(window as any).NativeShare?.shareBase64Files;

    const files: Array<{ filename: string; content: Blob }> = [];
    for (let page = 0; page < pageCount; page++) {
      const offset = page * MAX_SLICE_HEIGHT;
      const sliceHeight = Math.min(MAX_SLICE_HEIGHT, height - offset);
      const blob = await renderSlice(documentElement, offset, sliceHeight);
      const suffix = pageCount > 1 ? `-${String(page + 1).padStart(2, "0")}` : "";
      const file = { filename: `${filenameBase}${suffix}.png`, content: blob };
      if (shouldBatch) files.push(file);
      else await saveOrShareBlobs([file], fileOptions);
    }
    if (shouldBatch) await saveOrShareBlobs(files, fileOptions);
    return pageCount;
  } finally {
    root.unmount();
    host.remove();
  }
}

function ConversationImageDocument({
  conversation,
  messages,
  titleFallback,
  youLabel,
  thoughtProcessLabel,
}: {
  conversation: Conversation;
  messages: Message[];
  titleFallback: string;
  youLabel: string;
  thoughtProcessLabel: string;
}) {
  return (
    <main
      data-conversation-export
      style={{
        width: EXPORT_WIDTH,
        padding: 40,
        color: "#18181b",
        background: "#ffffff",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <style>{`[data-conversation-export] button { display: none !important; }`}</style>
      <header style={{ borderBottom: "1px solid #e4e4e7", paddingBottom: 18, marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.25 }}>
          {conversation.title || titleFallback}
        </h1>
        <div style={{ color: "#71717a", marginTop: 6, fontSize: 12 }}>
          {new Date(conversation.createdAt).toLocaleDateString()}
        </div>
      </header>
      <section>
        {messages.map((message) => {
          const isUser = message.role === "user";
          const name = isUser ? youLabel : (message.senderName ?? "AI");
          return (
            <article
              key={message.id}
              style={{ borderBottom: "1px solid #e4e4e7", padding: "0 0 22px", marginBottom: 22 }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <strong style={{ color: isUser ? "#18181b" : "#2563eb", fontSize: 13 }}>
                  {name}
                </strong>
                <time style={{ color: "#a1a1aa", fontSize: 11 }}>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {message.images.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  {message.images.map((source, index) => (
                    <img
                      key={`${message.id}-input-${index}`}
                      src={source}
                      alt=""
                      style={{ maxWidth: "100%", maxHeight: 500, objectFit: "contain" }}
                    />
                  ))}
                </div>
              )}
              {message.reasoningContent && (
                <details open style={{ color: "#71717a", marginBottom: 10 }}>
                  <summary style={{ fontSize: 12 }}>{thoughtProcessLabel}</summary>
                  <div
                    style={{ whiteSpace: "pre-wrap", padding: "8px 12px", background: "#f4f4f5" }}
                  >
                    {message.reasoningContent}
                  </div>
                </details>
              )}
              {message.content && <MarkdownRenderer content={message.content} />}
              {message.generatedImages.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {message.generatedImages.map((source, index) => (
                    <img
                      key={`${message.id}-generated-${index}`}
                      src={source}
                      alt=""
                      style={{ maxWidth: "100%", maxHeight: 600, objectFit: "contain" }}
                    />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

async function renderSlice(source: HTMLElement, offset: number, height: number): Promise<Blob> {
  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  await inlineImages(clone);
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = `${-offset}px`;
  clone.style.margin = "0";

  const viewport = document.createElement("div");
  viewport.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  viewport.style.cssText = `position:relative;width:${EXPORT_WIDTH}px;height:${height}px;overflow:hidden;background:#fff;`;
  viewport.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(viewport);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = svgUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(EXPORT_WIDTH * SCALE);
  canvas.height = Math.ceil(height * SCALE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.scale(SCALE, SCALE);
  context.drawImage(image, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode PNG"))),
      "image/png",
    );
  });
}

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const targetElement = target as HTMLElement;
  for (const property of computed) {
    targetElement.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    );
  }
  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children[index];
    if (targetChild) inlineComputedStyles(child, targetChild);
  });
}

async function inlineImages(root: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(async (image) => {
      if (!image.src || image.src.startsWith("data:")) return;
      const response = await fetch(image.src);
      if (!response.ok) throw new Error(`Failed to load export image: ${response.status}`);
      image.src = await blobToDataUrl(await response.blob());
    }),
  );
}

async function waitForAssets(root: HTMLElement): Promise<void> {
  if (document.fonts) await document.fonts.ready;
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Failed to load export image: ${image.src}`));
          }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function waitForElement(parent: HTMLElement, selector: string): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const element = parent.querySelector<HTMLElement>(selector);
    if (element) return element;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Conversation export view did not render");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50) || "conversation";
}
