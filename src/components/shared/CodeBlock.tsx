import { memo, useState, useCallback, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { IoCodeSlashOutline } from "../../icons";
import { MermaidRenderer } from "./MermaidRenderer";
import { HtmlPreview } from "./HtmlPreview";
import { highlightCode } from "../../lib/shiki";

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
  isStreaming?: boolean;
}

export const CodeBlock = memo(function CodeBlock({
  className,
  children,
  isStreaming,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1]?.toLowerCase() || "";
  const codeString = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeString]);

  // Mermaid — only render after streaming complete
  if (lang === "mermaid") {
    if (isStreaming) {
      return (
        <div
          className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
          style={{ border: "0.5px solid var(--border)" }}
        >
          <div
            className="flex items-center px-3 py-1.5"
            style={{
              backgroundColor: "var(--secondary)",
              borderBottom: "0.5px solid var(--border)",
            }}
          >
            <span
              className="font-mono text-[10px] font-bold uppercase"
              style={{ color: "var(--primary)" }}
            >
              mermaid · rendering after completion
            </span>
          </div>
          <pre
            className="m-0 overflow-x-auto px-3 py-2 font-mono text-[13px] leading-relaxed"
            style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
          >
            <code>{codeString}</code>
          </pre>
        </div>
      );
    }
    return (
      <div
        className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
        style={{ border: "0.5px solid var(--border)", backgroundColor: "var(--card)" }}
      >
        <MermaidRenderer chart={codeString} />
      </div>
    );
  }

  // HTML / SVG — only render after streaming complete
  if (lang === "html" || lang === "svg") {
    if (isStreaming) {
      const lineCount = codeString.split("\n").length;
      return (
        <div
          className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
          style={{ border: "0.5px solid var(--border)", backgroundColor: "var(--card)" }}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <IoCodeSlashOutline
              size={18}
              color="var(--muted-foreground)"
              className="flex-shrink-0 animate-spin"
              style={{ animationDuration: "1.5s" }}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                {lang.toUpperCase()} ...
              </span>
              <p
                className="mt-0.5 text-[11px]"
                style={{ color: "color-mix(in srgb, var(--muted-foreground) 60%, transparent)" }}
              >
                {lineCount} lines
              </p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-1 w-full max-w-full min-w-0">
        <HtmlPreview code={codeString} language={lang} />
      </div>
    );
  }

  // Regular code block with language — full-bleed, matches RN MarkdownCodeBlock
  if (match) {
    // During streaming: show compact "coding" indicator instead of raw code
    if (isStreaming) {
      const lineCount = codeString.split("\n").length;
      return (
        <div
          className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
          style={{ border: "0.5px solid var(--border)" }}
        >
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ backgroundColor: "var(--primary)" }}
              />
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color: "var(--primary)" }}
              >
                {lang.toUpperCase()}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                · coding… {lineCount} lines
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <HighlightedCodeBlock lang={lang} code={codeString} copied={copied} onCopy={handleCopy} />
    );
  }

  // Inline code
  return (
    <code
      className="rounded px-1.5 py-0.5 font-mono text-[13px]"
      style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
      {...props}
    >
      {children}
    </code>
  );
});

function HighlightedCodeBlock({
  lang,
  code,
  copied,
  onCopy,
}: {
  lang: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isDark = document.documentElement.classList.contains("dark");
    highlightCode(code, lang, isDark ? "github-dark" : "github-light").then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return (
    <div
      className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
      style={{ border: "0.5px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: "var(--secondary)", borderBottom: "0.5px solid var(--border)" }}
      >
        <span
          className="font-mono text-[10px] font-bold uppercase"
          style={{ color: "var(--muted-foreground)" }}
        >
          {lang}
        </span>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] active:opacity-60"
          style={{ color: "var(--muted-foreground)" }}
        >
          {copied ? <Check size={10} style={{ color: "var(--primary)" }} /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        {html ? (
          <div
            className="shiki-code text-[13px] leading-relaxed [&_code]:bg-transparent [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:px-3 [&_pre]:py-2"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre
            className="m-0 px-3 py-2 font-mono text-[13px] leading-relaxed"
            style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
