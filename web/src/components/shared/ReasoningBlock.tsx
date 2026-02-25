import { memo, useState } from "react";
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
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className={isStreaming ? "animate-pulse text-primary" : ""} />
        <span className="font-medium">
          {isStreaming ? "Thinking..." : "Reasoning"}
        </span>
        {durationText && (
          <span className="text-muted-foreground/60">({durationText})</span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-5 pl-3 border-l-2 border-primary/20 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
});
