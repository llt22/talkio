import { memo, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface ReasoningBlockProps {
  content: string;
  duration?: number | null;
  isStreaming?: boolean;
}

export const ReasoningBlock = memo(function ReasoningBlock({
  content,
  duration,
  isStreaming = false,
}: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand during streaming so user can watch thinking in real-time
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  if (!content) return null;

  const durationText = duration
    ? duration >= 60
      ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
      : `${Math.round(duration)}s`
    : null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className={isStreaming ? "text-primary animate-pulse" : ""} />
        <span className="font-medium">{isStreaming ? "Thinking..." : "Reasoning"}</span>
        {durationText && <span className="text-muted-foreground/60">({durationText})</span>}
      </button>
      {expanded && (
        <div className="border-primary/20 text-muted-foreground mt-1.5 ml-5 border-l-2 pl-3 text-xs leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
});
