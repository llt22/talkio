import { memo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "./CodeBlock";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

// Stable link component — never changes, no deps
const LinkComponent = ({ href, children, ...props }: any) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary underline underline-offset-2 hover:text-primary/80"
    {...props}
  >
    {children}
  </a>
);

// Remove ReactMarkdown's default <pre> wrapper so our CodeBlock (which renders <div>)
// doesn't get nested inside <pre> (invalid HTML that can cause layout/overflow issues).
const PreComponent = ({ children }: any) => <>{children}</>;

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming = false,
}: MarkdownRendererProps) {
  // Keep isStreaming in a ref so the code component closure always reads
  // the latest value without causing components to be re-created.
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // Stable code component — identity never changes, reads streaming via ref
  const codeComponent = useCallback(
    ({ inline, className, children, ...props }: any) => (
      <CodeBlock
        className={className}
        isStreaming={inline ? false : isStreamingRef.current}
        {...props}
      >
        {children}
      </CodeBlock>
    ),
    [], // no deps — ref gives us latest value without identity change
  );

  return (
    <div className="prose prose-sm max-w-none text-foreground overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ pre: PreComponent, code: codeComponent, a: LinkComponent }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
