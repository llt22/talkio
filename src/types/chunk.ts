export enum ChunkType {
  TEXT_START = "text_start",
  TEXT_DELTA = "text_delta",
  TEXT_COMPLETE = "text_complete",
  THINKING_START = "thinking_start",
  THINKING_DELTA = "thinking_delta",
  THINKING_COMPLETE = "thinking_complete",
  TOOL_CALL = "tool_call",
  TOOL_RESULT = "tool_result",
  ERROR = "error",
  COMPLETE = "complete",
}

export type Chunk =
  | { type: ChunkType.TEXT_START }
  | { type: ChunkType.TEXT_DELTA; text: string }
  | { type: ChunkType.TEXT_COMPLETE; text: string }
  | { type: ChunkType.THINKING_START }
  | { type: ChunkType.THINKING_DELTA; text: string }
  | { type: ChunkType.THINKING_COMPLETE; text: string }
  | {
      type: ChunkType.TOOL_CALL;
      toolCall: { id: string; name: string; arguments: string };
    }
  | {
      type: ChunkType.TOOL_RESULT;
      toolCallId: string;
      content: string;
    }
  | { type: ChunkType.ERROR; error: Error }
  | {
      type: ChunkType.COMPLETE;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    };

export interface StreamProcessorCallbacks {
  onTextStart?: () => void;
  onTextChunk?: (text: string) => void;
  onTextComplete?: (text: string) => void;
  onThinkingStart?: () => void;
  onThinkingChunk?: (text: string) => void;
  onThinkingComplete?: (text: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
  onToolResult?: (toolCallId: string, content: string) => void;
  onError?: (error: Error) => void;
  onComplete?: (usage?: Chunk extends { type: ChunkType.COMPLETE } ? Chunk : never) => void;
}

export function createStreamProcessor(callbacks: StreamProcessorCallbacks) {
  return (chunk: Chunk) => {
    switch (chunk.type) {
      case ChunkType.TEXT_START:
        callbacks.onTextStart?.();
        break;
      case ChunkType.TEXT_DELTA:
        callbacks.onTextChunk?.(chunk.text);
        break;
      case ChunkType.TEXT_COMPLETE:
        callbacks.onTextComplete?.(chunk.text);
        break;
      case ChunkType.THINKING_START:
        callbacks.onThinkingStart?.();
        break;
      case ChunkType.THINKING_DELTA:
        callbacks.onThinkingChunk?.(chunk.text);
        break;
      case ChunkType.THINKING_COMPLETE:
        callbacks.onThinkingComplete?.(chunk.text);
        break;
      case ChunkType.TOOL_CALL:
        callbacks.onToolCall?.(chunk.toolCall);
        break;
      case ChunkType.TOOL_RESULT:
        callbacks.onToolResult?.(chunk.toolCallId, chunk.content);
        break;
      case ChunkType.ERROR:
        callbacks.onError?.(chunk.error);
        break;
      case ChunkType.COMPLETE:
        callbacks.onComplete?.();
        break;
    }
  };
}
