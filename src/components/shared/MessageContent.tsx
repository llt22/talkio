import { memo } from "react";
import { Bot, User, AlertCircle, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ReasoningBlock } from "./ReasoningBlock";
import type { Message, MessageBlock } from "../../types";
import { MessageStatus, MessageBlockType, MessageBlockStatus } from "../../types";

interface MessageContentProps {
  message: Message;
  blocks?: MessageBlock[];
  isStreaming?: boolean;
}

export const MessageContent = memo(function MessageContent({
  message,
  blocks = [],
  isStreaming = false,
}: MessageContentProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const streaming = isStreaming || message.status === MessageStatus.STREAMING;
  const hasError = message.status === MessageStatus.ERROR;

  // Block-based rendering
  if (blocks.length > 0) {
    return (
      <div className="space-y-1">
        {blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            isStreaming={block.status === MessageBlockStatus.STREAMING}
          />
        ))}
      </div>
    );
  }

  // Legacy single-content rendering
  return (
    <div>
      {message.reasoningContent && (
        <ReasoningBlock
          content={message.reasoningContent}
          duration={message.reasoningDuration}
          isStreaming={streaming && !message.content}
        />
      )}

      {message.content && <MarkdownRenderer content={message.content} isStreaming={streaming} />}

      {hasError && message.errorMessage && (
        <div className="bg-destructive/10 text-destructive mt-2 flex items-start gap-2 rounded-lg p-2.5 text-xs">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{message.errorMessage}</span>
        </div>
      )}

      {streaming && !message.content && !message.reasoningContent && (
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Generating...</span>
        </div>
      )}
    </div>
  );
});

function BlockRenderer({ block, isStreaming }: { block: MessageBlock; isStreaming: boolean }) {
  switch (block.type) {
    case MessageBlockType.THINKING:
      return <ReasoningBlock content={block.content} isStreaming={isStreaming} />;
    case MessageBlockType.MAIN_TEXT:
      return <MarkdownRenderer content={block.content} isStreaming={isStreaming} />;
    case MessageBlockType.TOOL:
      return (
        <div className="bg-muted border-border my-1 rounded-md border p-2 text-xs">
          <div className="text-muted-foreground mb-1 font-medium">Tool Call</div>
          <pre className="overflow-x-auto text-[11px] whitespace-pre-wrap">{block.content}</pre>
        </div>
      );
    case MessageBlockType.ERROR:
      return (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg p-2.5 text-xs">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{block.content}</span>
        </div>
      );
    case MessageBlockType.IMAGE:
      return (
        <img
          src={block.content}
          alt="Generated"
          className="max-h-80 max-w-full rounded-lg object-contain"
        />
      );
    default:
      return <MarkdownRenderer content={block.content} isStreaming={isStreaming} />;
  }
}
