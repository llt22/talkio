import { memo, useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { MermaidRenderer } from "./MermaidRenderer";
import { HtmlPreview } from "./HtmlPreview";

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
  isStreaming?: boolean;
}

export const CodeBlock = memo(function CodeBlock({ className, children, isStreaming, ...props }: CodeBlockProps) {
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
        <div className="relative my-2 rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center px-3 py-1 bg-purple-50 border-b border-gray-200">
            <span className="text-[10px] font-mono text-purple-600 uppercase">mermaid (rendering after completion)</span>
          </div>
          <pre className="p-3 text-xs leading-relaxed overflow-x-auto bg-gray-50 m-0"><code>{codeString}</code></pre>
        </div>
      );
    }
    return <MermaidRenderer chart={codeString} />;
  }

  // HTML — only render after streaming complete
  if (lang === "html") {
    if (isStreaming) {
      return (
        <div className="relative my-2 rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center px-3 py-1 bg-blue-50 border-b border-gray-200">
            <span className="text-[10px] font-mono text-blue-600 uppercase">html (preview after completion)</span>
          </div>
          <pre className="p-3 text-xs leading-relaxed overflow-x-auto bg-gray-50 m-0"><code>{codeString}</code></pre>
        </div>
      );
    }
    return <HtmlPreview code={codeString} />;
  }

  // Regular code block with language
  if (match) {
    return (
      <div className="relative my-2 rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 bg-gray-100 border-b border-gray-200">
          <span className="text-[10px] font-mono text-gray-500 uppercase">{lang}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          >
            {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 text-xs leading-relaxed overflow-x-auto bg-gray-50 m-0">
          <code className={className} {...props}>{children}</code>
        </pre>
      </div>
    );
  }

  // Inline code
  return (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
      {children}
    </code>
  );
});
