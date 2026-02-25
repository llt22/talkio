import { memo } from "react";
import { Bot, User, AlertCircle, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ReasoningBlock } from "./ReasoningBlock";
import type { Message, MessageBlock } from "../../../../src/types";
import { MessageStatus, MessageBlockType, MessageBlockStatus } from "../../../../src/types";

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

      {message.content && (
        <MarkdownRenderer content={message.content} isStreaming={streaming} />
      )}

      {hasError && message.errorMessage && (
        <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{message.errorMessage}</span>
        </div>
      )}

      {streaming && !message.content && !message.reasoningContent && (
        <div className="flex items-center gap-2 text-muted-foreground">
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
      return (
        <ReasoningBlock
          content={block.content}
          isStreaming={isStreaming}
        />
      );
    case MessageBlockType.MAIN_TEXT:
      return <MarkdownRenderer content={block.content} isStreaming={isStreaming} />;
    case MessageBlockType.TOOL:
      return (
        <div className="my-1 p-2 rounded-md bg-muted border border-border text-xs">
          <div className="font-medium text-muted-foreground mb-1">Tool Call</div>
          <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">{block.content}</pre>
        </div>
      );
    case MessageBlockType.ERROR:
      return (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{block.content}</span>
        </div>
      );
    case MessageBlockType.IMAGE:
      return (
        <img
          src={block.content}
          alt="Generated"
          className="rounded-lg max-w-full max-h-80 object-contain"
        />
      );
    default:
      return <MarkdownRenderer content={block.content} isStreaming={isStreaming} />;
  }
}
