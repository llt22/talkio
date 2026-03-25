/**
 * MessageRow — renders a single chat message (user or assistant).
 * Extracted from ChatView.tsx for readability.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IoCopyOutline,
  IoRefreshOutline,
  IoShareOutline,
  IoTrashOutline,
  IoAnalyticsOutline,
} from "../../icons";
import {
  GitBranch,
  Wrench,
  Hourglass,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
  FileText,
  FolderOpen,
  Save,
} from "lucide-react";
import { MessageContent } from "./MessageContent";
import type { Message } from "../../types";
import { MessageStatus } from "../../types";
import type { WrittenFile, WorkspaceFileStatus } from "../../services/file-writer";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";

// ── Ionicons-style action button (1:1 RN ActionButton) ──

const ICON_MAP: Record<string, React.FC<{ size: number; color?: string }>> = {
  "copy-outline": IoCopyOutline,
  "refresh-outline": IoRefreshOutline,
  "share-outline": IoShareOutline,
  "trash-outline": IoTrashOutline,
};

function ActionBtn({
  icon,
  onClick,
  color,
}: {
  icon: string;
  onClick: () => void;
  color?: string;
}) {
  const IconComp = ICON_MAP[icon];
  if (!IconComp) return null;
  return (
    <button onClick={onClick} className="rounded-md p-1.5 active:opacity-60" title={icon}>
      <IconComp size={15} color={color ?? "var(--muted-foreground)"} />
    </button>
  );
}

// ── Token usage badge (1:1 RN) ──

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Message Bubble (1:1 RN MessageBubble) ──

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

export interface MessageRowProps {
  message: Message;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  isGenerating?: boolean;
  writtenFiles?: WrittenFile[];
  pendingFileBlocks?: { path: string; content: string }[];
  pendingFileStatuses?: WorkspaceFileStatus[];
  onApplyFileBlocks?: (messageId: string, targetPath?: string) => void;
}

// ── Assistant action bar: primary buttons + ··· overflow menu ──

function AssistantActionBar({
  content,
  message,
  onCopy,
  onRegenerate,
  onBranch,
  onDelete,
  t,
}: {
  content: string;
  message: Message;
  onCopy?: (c: string) => void;
  onRegenerate?: (id: string) => void;
  onBranch?: (id: string) => void;
  onDelete?: (id: string) => void;
  t: (key: string) => string;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="ml-1 flex items-center gap-0.5">
      {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
      {onRegenerate && (
        <ActionBtn icon="refresh-outline" onClick={() => onRegenerate(message.id)} />
      )}
      {message.tokenUsage && (
        <div
          className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <IoAnalyticsOutline size={11} color="var(--muted-foreground)" />
          <span className="text-muted-foreground font-mono text-[10px]">
            {formatTokens(message.tokenUsage.inputTokens)}→
            {formatTokens(message.tokenUsage.outputTokens)}
          </span>
        </div>
      )}

      {/* ··· overflow menu */}
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="rounded-md p-1.5 active:opacity-60"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div
              className="absolute bottom-full left-0 z-30 mb-1 min-w-[150px] rounded-xl py-1 shadow-lg"
              style={{ backgroundColor: "var(--card)", border: "0.5px solid var(--border)" }}
            >
              {onBranch && (
                <button
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                  onClick={() => {
                    setShowMenu(false);
                    onBranch(message.id);
                  }}
                >
                  <GitBranch size={15} color="var(--foreground)" />
                  <span className="text-foreground text-[13px]">{t("chat.branchFromHere")}</span>
                </button>
              )}
              <button
                className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                onClick={() => {
                  setShowMenu(false);
                  if (navigator.share) navigator.share({ text: content }).catch(() => {});
                  else navigator.clipboard.writeText(content);
                }}
              >
                <IoShareOutline size={15} color="var(--foreground)" />
                <span className="text-foreground text-[13px]">{t("chat.export")}</span>
              </button>
              {onDelete && (
                <>
                  <div
                    style={{
                      height: "0.5px",
                      backgroundColor: "var(--border)",
                      margin: "2px 12px",
                    }}
                  />
                  <button
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(message.id);
                    }}
                  >
                    <IoTrashOutline size={15} color="var(--destructive)" />
                    <span className="text-[13px]" style={{ color: "var(--destructive)" }}>
                      {t("common.delete")}
                    </span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const MessageRow = memo(function MessageRow({
  message,
  onCopy,
  onRegenerate,
  onBranch,
  onDelete,
  onEdit,
  isGenerating,
  writtenFiles,
  pendingFileBlocks,
  pendingFileStatuses,
  onApplyFileBlocks,
}: MessageRowProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isStreaming = message.status === MessageStatus.STREAMING;
  const rawContent = (message.content || "").trimEnd();

  // Parse out <file> tags: extract names for chips, return clean user text
  const { displayText: content, fileNames } = useMemo(() => {
    const names: string[] = [];
    const cleaned = rawContent.replace(
      /<file\s+path=["']([^"']+)["']\s*>[\s\S]*?<\/file>\s*/g,
      (_m, path) => {
        names.push(path);
        return "";
      },
    );
    return { displayText: cleaned.trimStart(), fileNames: names };
  }, [rawContent]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedPendingFiles, setExpandedPendingFiles] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = useCallback(() => {
    setEditText(content);
    setIsEditing(true);
    // Auto-focus after render
    setTimeout(() => editRef.current?.focus(), 50);
  }, [content]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  const confirmEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === content) {
      cancelEditing();
      return;
    }
    onEdit?.(message.id, trimmed);
    setIsEditing(false);
    setEditText("");
  }, [editText, content, onEdit, message.id, cancelEditing]);

  if (isUser) {
    return (
      <div data-message-id={message.id} className="group mb-6 flex flex-col items-end gap-1 px-4">
        {/* Label */}
        <div className="mr-1 flex items-baseline gap-2">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            {t("chat.you")}
          </span>
          <span className="text-muted-foreground/60 text-[10px]">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {/* User images */}
        {message.images && message.images.length > 0 && (
          <div className="flex max-w-[80%] flex-wrap gap-1.5">
            {message.images.map((uri: string, idx: number) => (
              <img key={idx} src={uri} className="h-32 w-32 rounded-lg object-cover" />
            ))}
          </div>
        )}

        {/* Attached file chips */}
        {fileNames.length > 0 && !isEditing && (
          <div className="flex max-w-[80%] flex-wrap gap-1" style={{ maxWidth: "min(80%, 640px)" }}>
            {fileNames.map((name, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 rounded-lg px-2 py-1"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 80%, white)",
                  opacity: 0.9,
                }}
              >
                <FileText size={12} color="white" className="flex-shrink-0" />
                <span className="max-w-[140px] truncate text-[11px] font-medium text-white">
                  {name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Bubble or Edit textarea */}
        {isEditing ? (
          <div className="w-full max-w-[80%]" style={{ maxWidth: "min(80%, 640px)" }}>
            <div
              className="rounded-2xl px-3"
              style={{ backgroundColor: "var(--muted)", border: "1px solid var(--primary)" }}
            >
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEditing();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    confirmEdit();
                  }
                }}
                className="text-foreground w-full resize-none bg-transparent py-3 text-[15px] leading-relaxed outline-none"
                style={{ minHeight: "60px" }}
                rows={Math.max(2, editText.split("\n").length)}
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={cancelEditing}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium active:opacity-70"
                style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}
              >
                <X size={14} />
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmEdit}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-white active:opacity-70"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <Check size={14} />
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="max-w-[80%] rounded-2xl px-4 py-3"
            style={{
              backgroundColor: "var(--primary)",
              maxWidth: "min(80%, 640px)",
              borderTopRightRadius: 0,
            }}
          >
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-white">
              {content || (message.images?.length ? "📷" : "")}
            </p>
          </div>
        )}

        {/* User action bar */}
        {!isEditing && (
          <div className="mr-1 flex items-center gap-0.5">
            {onEdit && !isGenerating && (
              <button
                onClick={startEditing}
                className="rounded-md p-1.5 active:opacity-60"
                title={t("common.edit")}
              >
                <Pencil size={14} color="var(--muted-foreground)" />
              </button>
            )}
            {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
            {onDelete && (
              <ActionBtn
                icon="trash-outline"
                onClick={() => onDelete(message.id)}
                color="var(--destructive)"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── AI message ──
  const senderName = message.senderName ?? "AI";
  const { color: senderColor } = getAvatarProps(senderName);

  // Structured label parts for rich display
  const labelParts = useMemo(() => {
    if (!message.senderModelId) return null;
    const providerStore = useProviderStore.getState();
    const identityStore = useIdentityStore.getState();
    const model = providerStore.getModelById(message.senderModelId);
    if (!model) return null;
    const modelName = model.displayName ?? message.senderModelId;
    const identity = message.identityId
      ? identityStore.getIdentityById(message.identityId)
      : null;
    const identityName = identity?.name ?? null;
    const provider = providerStore.getProviderById(model.providerId);
    const providerName = provider?.name ?? null;
    // #N suffix: parse from stored senderName (e.g. "ModelName #2")
    let suffix: string | null = null;
    if (message.senderName) {
      const match = message.senderName.match(/#(\d+)$/);
      if (match) suffix = `#${match[1]}`;
    }
    return { modelName, identityName, providerName, suffix };
  }, [message.senderModelId, message.identityId, message.senderName]);

  return (
    <div data-message-id={message.id} className="group mb-6 flex flex-col gap-1 px-4">
      {/* Label */}
      <div className="ml-1 flex items-baseline gap-2">
        <span
          className="max-w-[360px] truncate text-[11px] font-semibold tracking-wider"
          style={{ color: senderColor }}
        >
          {labelParts ? (
            <>
              <span className="uppercase">{labelParts.modelName}</span>
              {labelParts.suffix && <span className="uppercase opacity-60"> {labelParts.suffix}</span>}
              {labelParts.identityName && (
                <span className="opacity-50 font-normal"> · {labelParts.identityName}</span>
              )}
              {labelParts.providerName && (
                <span className="opacity-40 font-normal"> · {labelParts.providerName}</span>
              )}
            </>
          ) : (
            <span className="uppercase">{senderName}</span>
          )}
        </span>
        <span className="text-muted-foreground/60 text-[10px]">
          {formatTime(message.createdAt)}
        </span>
      </div>

      {/* Main bubble — hide when only toolCalls with no content */}
      {(content || isStreaming || !(message.toolCalls && message.toolCalls.length > 0)) && (
        <div
          className="min-w-0 overflow-hidden rounded-2xl px-4 py-3"
          style={{
            backgroundColor: "var(--muted)",
            borderTopLeftRadius: 0,
            maxWidth: 720,
          }}
        >
          {isStreaming && !content && !message.reasoningContent ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full" />
              <span
                className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
          ) : (
            <MessageContent message={message} isStreaming={isStreaming} />
          )}
        </div>
      )}

      {/* Tool Calls — compact inline cards */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1" style={{ maxWidth: 720 }}>
          {message.toolCalls.map((tc) => {
            const result = message.toolResults?.find((r) => r.toolCallId === tc.id);
            const isExpanded = expandedTools.has(tc.id);
            const isPending = !result;
            return (
              <div key={tc.id} className="overflow-hidden rounded-lg">
                <button
                  onClick={() => {
                    if (isPending) return;
                    setExpandedTools((prev) => {
                      const next = new Set(prev);
                      next.has(tc.id) ? next.delete(tc.id) : next.add(tc.id);
                      return next;
                    });
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 ${isPending ? "cursor-default" : "active:opacity-70"}`}
                  style={{ backgroundColor: "color-mix(in srgb, var(--muted) 70%, transparent)" }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {isPending ? (
                      <Hourglass
                        size={13}
                        color="#d97706"
                        className="flex-shrink-0 animate-spin"
                        style={{ animationDuration: "2s" }}
                      />
                    ) : (
                      <Wrench size={13} color="var(--muted-foreground)" className="flex-shrink-0" />
                    )}
                    <span
                      className={`truncate text-[12px] font-medium ${isPending ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {isPending ? `${tc.name}…` : tc.name}
                    </span>
                  </div>
                  {!isPending &&
                    (isExpanded ? (
                      <ChevronUp size={14} color="var(--muted-foreground)" />
                    ) : (
                      <ChevronDown size={14} color="var(--muted-foreground)" />
                    ))}
                </button>
                {isExpanded && result && (
                  <div
                    className="mt-0.5 rounded-lg px-2.5 py-2"
                    style={{ backgroundColor: "var(--muted)" }}
                  >
                    <p className="text-muted-foreground text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                      {result.content.slice(0, 1000)}
                      {result.content.length > 1000 ? " …" : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending generated files */}
      {pendingFileBlocks && pendingFileBlocks.length > 0 && (
        <div className="mt-1 flex flex-col gap-2" style={{ maxWidth: 720 }}>
          <div className="flex flex-col gap-2">
            {pendingFileBlocks.map((block, idx) => {
              const status = pendingFileStatuses?.find((s) => s.path === block.path);
              const isExpanded = expandedPendingFiles.has(block.path);
              const previewText = (status?.exists ? status.currentContent : block.content) || "";
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-lg"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--secondary) 80%, transparent)",
                    border: "0.5px solid color-mix(in srgb, var(--border) 80%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <FileText size={13} color="var(--muted-foreground)" className="flex-shrink-0" />
                    <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                      {block.path}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: status?.exists
                          ? "color-mix(in srgb, var(--destructive) 10%, transparent)"
                          : "color-mix(in srgb, var(--primary) 10%, transparent)",
                        color: status?.exists ? "var(--destructive)" : "var(--primary)",
                      }}
                    >
                      {status?.exists ? t("chat.overwrite") : t("chat.create")}
                    </span>
                    <button
                      onClick={() =>
                        setExpandedPendingFiles((prev) => {
                          const next = new Set(prev);
                          next.has(block.path) ? next.delete(block.path) : next.add(block.path);
                          return next;
                        })
                      }
                      className="rounded p-1 active:opacity-70"
                      title={t("chat.previewFile")}
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} color="var(--muted-foreground)" />
                      ) : (
                        <ChevronDown size={14} color="var(--muted-foreground)" />
                      )}
                    </button>
                    {onApplyFileBlocks && (
                      <button
                        onClick={() => onApplyFileBlocks(message.id, block.path)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-opacity active:opacity-70"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                          color: "var(--primary)",
                        }}
                      >
                        <Save size={12} className="flex-shrink-0" />
                        {t("chat.applyThisFile")}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div
                      className="border-t px-2.5 py-2"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
                    >
                      {status?.exists && status.currentContent !== undefined && (
                        <div className="mb-2">
                          <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                            {t("chat.currentFile")}
                          </div>
                          <pre className="text-muted-foreground max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                            {status.currentContent.slice(0, 1200)}
                            {status.currentContent.length > 1200 ? "\n…" : ""}
                          </pre>
                        </div>
                      )}
                      <div>
                        <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                          {t("chat.generatedFile")}
                        </div>
                        <pre className="text-foreground max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                          {block.content.slice(0, 1600)}
                          {block.content.length > 1600 ? "\n…" : ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {onApplyFileBlocks && pendingFileBlocks.length > 1 && (
            <div>
              <button
                onClick={() => onApplyFileBlocks(message.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity active:opacity-70"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                  color: "var(--primary)",
                  border: "0.5px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                }}
              >
                <Save size={13} className="flex-shrink-0" />
                {t("chat.applyFiles")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Written files chips */}
      {writtenFiles && writtenFiles.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5" style={{ maxWidth: 720 }}>
          {writtenFiles.map((wf, idx) => (
            <button
              key={idx}
              onClick={async () => {
                if (!window.__TAURI_INTERNALS__) return;
                try {
                  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                  await revealItemInDir(wf.fullPath);
                } catch {
                  /* fallback: do nothing */
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-opacity active:opacity-70"
              style={{
                backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                border: "0.5px solid color-mix(in srgb, var(--primary) 20%, transparent)",
              }}
              title={wf.fullPath}
            >
              <Save size={13} color="var(--primary)" className="flex-shrink-0" />
              <span
                className="max-w-[200px] truncate text-[12px] font-medium"
                style={{ color: "var(--primary)" }}
              >
                {wf.path}
              </span>
              <FolderOpen size={12} color="var(--muted-foreground)" className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Assistant action bar — primary: copy + regenerate, secondary: ··· menu */}
      {!isStreaming && (content || message.status === MessageStatus.ERROR) && (
        <AssistantActionBar
          content={content}
          message={message}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onBranch={onBranch}
          onDelete={onDelete}
          t={t}
        />
      )}
    </div>
  );
});
