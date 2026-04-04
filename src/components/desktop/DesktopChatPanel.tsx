import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  MoreHorizontal,
  Trash2,
  UserPlus,
  Share2,
  Copy,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Pencil,
  ArrowDown,
  ArrowUpDown,
  Shuffle,
  Layers,
  GripVertical,
  Plus,
  Minimize2,
  FolderOpen,
  Search,
  FileSearch,
  AlertTriangle,
  FileDown,
  X,
  Sparkles,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChatView, type ChatViewHandle } from "../shared/ChatView";
import { MentionTextarea } from "../shared/MentionTextarea";
import { ModelPicker } from "../shared/ModelPicker";
import { AddMemberPicker } from "../shared/AddMemberPicker";
import { useChatStore } from "../../stores/chat-store";
import { manualCompress, setManualSummary, getManualSummary } from "../../lib/context-compression";
import { buildApiMessagesForParticipant, getParticipantLabel, getParticipantLabelParts } from "../../stores/chat-message-builder";
import { buildProviderHeaders } from "../../services/provider-headers";
import { useProviderStore } from "../../stores/provider-store";
import { useChatPanelState } from "../../hooks/useChatPanelState";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { ConversationParticipant, Identity, ReasoningEffort } from "../../types";
import { nextReasoningEffort, REASONING_EFFORT_LEVELS } from "../../types";
import { MessageStatus } from "../../types";
import { exportConversationAsMarkdown, exportConversationAsPdf } from "../../services/export";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import { updateConversation } from "../../storage/database";
import { notifyDbChange } from "../../hooks/useDatabase";
import { getWorkspaceName, pickWorkspaceDir } from "../../services/workspace";

// ── Drag-sortable participant row ──

function SortableParticipantRow({
  participant: p,
  index: idx,
  allParticipants,
  getModelById,
  getIdentityById,
  onEditRole,
  onRemove,
  isSequential,
  onReasoningEffortCycle,
}: {
  participant: ConversationParticipant;
  index: number;
  allParticipants: ConversationParticipant[];
  getModelById: (id: string) => any;
  getIdentityById: (id: string) => any;
  onEditRole: () => void;
  onRemove: () => void;
  isSequential: boolean;
  onReasoningEffortCycle: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const pModel = getModelById(p.modelId);
  const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
  const parts = getParticipantLabelParts(p, allParticipants);
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 py-2">
      {isSequential && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab p-0.5 hover:opacity-70 active:cursor-grabbing"
        >
          <GripVertical size={14} className="text-muted-foreground" />
        </button>
      )}
      <span className="text-muted-foreground w-4 flex-shrink-0 text-center text-[11px]">
        {idx + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-[13px] font-medium">
          {parts.modelName}
          {parts.suffix && <span className="text-muted-foreground"> {parts.suffix}</span>}
        </p>
        {parts.providerName && (
          <p className="text-muted-foreground truncate text-[11px]">{parts.providerName}</p>
        )}
      </div>
      <button
        className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-80"
        style={{
          backgroundColor: p.reasoningEffort
            ? "color-mix(in srgb, var(--primary) 10%, transparent)"
            : "var(--muted)",
          color: p.reasoningEffort ? "var(--primary)" : "var(--muted-foreground)",
        }}
        onClick={onReasoningEffortCycle}
        title={t("providerEdit.reasoningEffort")}
      >
        <Sparkles size={10} className="inline mr-0.5" />
        {p.reasoningEffort
          ? t(`providerEdit.reasoningEffort_${p.reasoningEffort}`)
          : t("providerEdit.reasoningEffort_default")}
      </button>
      <button
        className="flex-shrink-0 rounded px-2 py-0.5 text-[11px] transition-opacity hover:opacity-80"
        style={{
          backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)",
          color: "var(--primary)",
        }}
        onClick={onEditRole}
      >
        {pIdentity ? pIdentity.name : t("chat.noIdentity")}
      </button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
        <Trash2 size={13} className="text-destructive" />
      </Button>
    </div>
  );
}

// ── Desktop Chat Panel ──

export function DesktopChatPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const chatViewRef = useRef<ChatViewHandle>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [errorNavIndex, setErrorNavIndex] = useState(0);
  const [errorNavDismissed, setErrorNavDismissed] = useState(false);
  const {
    conv,
    messages,
    identities,
    getModelById,
    getIdentityById,
    clearConversationMessages,
    updateParticipantIdentity,
    updateParticipantReasoningEffort,
    removeParticipant,
    isGroup,
    currentParticipant,
    model,
    activeIdentity,
    showIdentityPanel,
    setShowIdentityPanel,
    showParticipants,
    setShowParticipants,
    showModelPicker,
    setShowModelPicker,
    isExporting,
    setIsExporting,
    handleModelPickerSelect,
    handleAddMembers,
    showAddMemberPicker,
    setShowAddMemberPicker,
    duplicateConversation,
  } = useChatPanelState(conversationId);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [groupPromptText, setGroupPromptText] = useState(conv?.groupSystemPrompt ?? "");
  useEffect(() => {
    setGroupPromptText(conv?.groupSystemPrompt ?? "");
  }, [conversationId]);
  useEffect(() => {
    const trimmed = groupPromptText.trim();
    if (trimmed === (conv?.groupSystemPrompt ?? "")) return;
    const timer = setTimeout(() => {
      useChatStore.getState().updateGroupSystemPrompt(conversationId, trimmed);
    }, 500);
    return () => clearTimeout(timer);
  }, [groupPromptText, conversationId]);
  const participantMentions = useMemo(
    () =>
      (conv?.participants ?? []).map((p) => {
        const parts = getParticipantLabelParts(p, conv?.participants ?? []);
        const secondary = [parts.identityName, parts.providerName].filter(Boolean).join(" \u00b7 ");
        return {
          id: p.id,
          label: getParticipantLabel(p, conv?.participants ?? []),
          secondaryLabel: secondary || undefined,
        };
      }),
    [conv?.participants],
  );
  const title = isGroup
    ? (conv?.title ?? t("chat.group"))
    : (model?.displayName ?? t("chat.chatTitle"));
  const subtitle = isGroup
    ? t("chat.modelCount", { count: conv?.participants.length ?? 0 })
    : (activeIdentity?.name ?? t("chat.mountIdentity"));

  const handleExport = useCallback(async () => {
    if (!conv || isExporting || messages.length === 0) return;
    setIsExporting(true);
    try {
      exportConversationAsMarkdown({
        conversation: conv,
        messages,
        titleFallback: t("chat.chatTitle"),
        youLabel: t("chat.you"),
        thoughtProcessLabel: t("chat.thoughtProcess"),
      });
    } finally {
      setIsExporting(false);
    }
  }, [conv, messages, isExporting]);

  // Error message navigation
  const errorMessageIds = useMemo(
    () => messages.filter((m) => m.status === MessageStatus.ERROR).map((m) => m.id),
    [messages],
  );
  // Reset dismissed state when new errors appear
  const prevErrorCountRef = useRef(errorMessageIds.length);
  useEffect(() => {
    if (errorMessageIds.length > prevErrorCountRef.current) setErrorNavDismissed(false);
    prevErrorCountRef.current = errorMessageIds.length;
  }, [errorMessageIds.length]);
  const navigateError = useCallback(
    (direction: "next" | "prev") => {
      if (errorMessageIds.length === 0) return;
      const newIndex =
        direction === "next"
          ? (errorNavIndex + 1) % errorMessageIds.length
          : (errorNavIndex - 1 + errorMessageIds.length) % errorMessageIds.length;
      setErrorNavIndex(newIndex);
      chatViewRef.current?.scrollToMessage(errorMessageIds[newIndex]);
    },
    [errorMessageIds, errorNavIndex],
  );

  const handleExportPdf = useCallback(async () => {
    if (!conv || isExporting || messages.length === 0) return;
    setIsExporting(true);
    try {
      await exportConversationAsPdf({
        conversation: conv,
        messages,
        titleFallback: t("chat.chatTitle"),
        youLabel: t("chat.you"),
        thoughtProcessLabel: t("chat.thoughtProcess"),
      });
    } finally {
      setIsExporting(false);
    }
  }, [conv, messages, isExporting]);

  const [isCompressing, setIsCompressing] = useState(false);
  const hasManualSummary = !!getManualSummary(conversationId);

  const handleCompress = useCallback(async () => {
    if (!conv || isCompressing || messages.length < 4) return;
    const firstParticipant = conv.participants[0];
    if (!firstParticipant) return;
    const providerStore = useProviderStore.getState();
    const pModel = providerStore.getModelById(firstParticipant.modelId);
    const pProvider = pModel ? providerStore.getProviderById(pModel.providerId) : null;
    if (!pModel || !pProvider) return;

    setIsCompressing(true);
    try {
      const apiMessages = buildApiMessagesForParticipant(messages, firstParticipant, conv);
      const baseUrl = pProvider.baseUrl.replace(/\/+$/, "");
      const headers = buildProviderHeaders(pProvider, { "Content-Type": "application/json" });
      const result = await manualCompress(apiMessages, {
        keepRecentCount: 6,
        baseUrl,
        headers,
        model: pModel.modelId,
      });
      setManualSummary(conversationId, `[Previous conversation summary]\n${result.summary}`);
      const pct = Math.round((1 - result.compressedTokens / result.originalTokens) * 100);
      await (
        await import("../../components/shared/ConfirmDialogProvider")
      ).appAlert(
        `${t("chat.compressSuccess")}\n${result.originalTokens} → ${result.compressedTokens} tokens (${pct}% ${t("chat.reduction")})`,
      );
    } catch (err) {
      await (
        await import("../../components/shared/ConfirmDialogProvider")
      ).appAlert(`${t("chat.compressFailed")}: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setIsCompressing(false);
    }
  }, [conv, messages, isCompressing, conversationId, t]);

  const handlePickWorkspace = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return;
    try {
      const dir = await pickWorkspaceDir();
      if (!dir) return;
      await updateConversation(conversationId, { workspaceDir: dir });
      notifyDbChange("conversations");
    } catch (err) {
      await (
        await import("../../components/shared/ConfirmDialogProvider")
      ).appAlert(`${t("common.error")}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [conversationId, t]);

  const handleClearWorkspace = useCallback(async () => {
    const ok = await confirm({
      title: t("common.areYouSure"),
      description: t("chat.removeWorkspaceConfirm"),
      destructive: true,
    });
    if (!ok) return;
    await updateConversation(conversationId, { workspaceDir: "" });
    notifyDbChange("conversations");
  }, [confirm, conversationId, t]);

  const handleAnalyzeProject = useCallback(() => {
    if (!conv?.workspaceDir) return;
    sendMessage(
      "请基于当前已打开的项目，先阅读项目结构和关键文件，然后给我一份简洁但具体的项目分析：\n1. 这是个什么项目\n2. 核心技术栈\n3. 主要目录职责\n4. 关键入口文件\n5. 当前代码结构的优点与风险\n6. 接下来最值得做的 3 件事\n如果某些关键文件还没加载，请明确说出还需要哪些相对路径文件。",
    );
  }, [conv?.workspaceDir, sendMessage]);

  const handleReviewProject = useCallback(() => {
    if (!conv?.workspaceDir) return;
    sendMessage(
      "请对当前已打开的项目做一次代码评审，重点关注：\n1. 架构设计\n2. 可维护性\n3. 性能风险\n4. 安全或误操作风险\n5. 用户体验缺口\n6. 按 P0 / P1 / P2 输出改进建议\n请基于你实际看到的目录和文件内容回答；如果还缺关键文件，请直接列出相对路径。",
    );
  }, [conv?.workspaceDir, sendMessage]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background flex flex-shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center">
          {isEditingTitle ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                renameConversation(conversationId, editTitle);
                setIsEditingTitle(false);
              }}
            >
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => {
                  renameConversation(conversationId, editTitle);
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                className="text-foreground border-primary w-48 border-b bg-transparent text-sm font-semibold outline-none"
              />
            </form>
          ) : (
            <>
              {isGroup && (
                <button
                  className="mr-1 flex-shrink-0 hover:opacity-70"
                  onClick={() => {
                    setEditTitle(conv?.title ?? "");
                    setIsEditingTitle(true);
                  }}
                >
                  <Pencil size={12} className="text-muted-foreground" />
                </button>
              )}
              <button
                className="flex min-w-0 items-center gap-1.5 text-left transition-opacity hover:opacity-70"
                onClick={() => {
                  if (isGroup) {
                    setShowParticipants((v) => !v);
                    setShowIdentityPanel(false);
                  } else {
                    setShowIdentityPanel((v) => !v);
                    setShowParticipants(false);
                  }
                }}
              >
                <span className="text-foreground truncate text-sm font-semibold">{title}</span>
                <span className="text-muted-foreground truncate text-xs">·</span>
                {isGroup ? (
                  conv?.speakingOrder === "parallel" ? (
                    <Layers size={12} className="text-primary flex-shrink-0" />
                  ) : conv?.speakingOrder === "random" ? (
                    <Shuffle size={12} className="text-primary flex-shrink-0" />
                  ) : (
                    <ArrowUpDown size={12} className="text-primary flex-shrink-0" />
                  )
                ) : (
                  <User size={12} className="text-primary flex-shrink-0" />
                )}
                <span className="text-primary truncate text-xs">{subtitle}</span>
                {showIdentityPanel || showParticipants ? (
                  <ChevronUp size={12} className="text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                )}
              </button>
            </>
          )}
        </div>

        {isCompressing && (
          <div
            className="flex animate-pulse items-center gap-1.5 rounded-lg px-2 py-1"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <Minimize2
              size={12}
              className="text-primary animate-spin"
              style={{ animationDuration: "2s" }}
            />
            <span className="text-primary text-[11px] font-medium">{t("chat.compressing")}</span>
          </div>
        )}
        {hasManualSummary && !isCompressing && (
          <div
            className="flex items-center gap-1 rounded-lg px-2 py-1"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
          >
            <Minimize2 size={11} className="text-primary" />
            <span className="text-primary text-[10px] font-medium">{t("chat.compressed")}</span>
          </div>
        )}

        {/* Reasoning Effort Selector (single chat only) */}
        {currentParticipant && !isGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: currentParticipant.reasoningEffort
                    ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                    : "var(--muted)",
                }}
              >
                <Sparkles size={11} className={currentParticipant.reasoningEffort ? "text-primary" : "text-muted-foreground"} />
                <span className={`text-[10px] font-medium ${currentParticipant.reasoningEffort ? "text-primary" : "text-muted-foreground"}`}>
                  {currentParticipant.reasoningEffort
                    ? t(`providerEdit.reasoningEffort_${currentParticipant.reasoningEffort}`)
                    : t("providerEdit.reasoningEffort")}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              {REASONING_EFFORT_LEVELS.map((level) => (
                <DropdownMenuItem
                  key={level ?? "__default__"}
                  onClick={() => updateParticipantReasoningEffort(conversationId, currentParticipant.id, level)}
                >
                  <span className="flex-1">
                    {level
                      ? t(`providerEdit.reasoningEffort_${level}`)
                      : t("providerEdit.reasoningEffort_default")}
                  </span>
                  {currentParticipant.reasoningEffort === level && (
                    <span className="text-primary text-xs font-semibold">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {conv?.workspaceDir && (
          <button
            className="max-w-[260px] rounded-lg px-2.5 py-1 transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)",
              border: "0.5px solid color-mix(in srgb, var(--primary) 20%, transparent)",
            }}
            title={conv.workspaceDir}
            onClick={async () => {
              if (!window.__TAURI_INTERNALS__) return;
              try {
                const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                await revealItemInDir(conv.workspaceDir!);
              } catch {
                // ignore opener errors
              }
            }}
          >
            <span className="flex items-center gap-1.5">
              <FolderOpen size={12} className="text-primary flex-shrink-0" />
              <span className="text-primary truncate text-[11px] font-medium">
                {getWorkspaceName(conv.workspaceDir)}
              </span>
            </span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => setShowAddMemberPicker(true)}>
              <UserPlus size={14} className="mr-2" />
              {t("chat.addMember")}
            </DropdownMenuItem>
            {isGroup && (
              <DropdownMenuItem
                onClick={async () => {
                  await duplicateConversation(conversationId);
                }}
              >
                <Copy size={14} className="mr-2" />
                {t("chat.duplicateGroup")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleExport}
              disabled={messages.length === 0 || isExporting}
            >
              <Share2 size={14} className="mr-2" />
              {t("chat.export")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleExportPdf}
              disabled={messages.length === 0 || isExporting}
            >
              <FileDown size={14} className="mr-2" />
              {t("chat.exportPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCompress}
              disabled={messages.length < 4 || isCompressing}
            >
              <Minimize2 size={14} className="mr-2" />
              {isCompressing
                ? t("chat.compressing")
                : hasManualSummary
                  ? t("chat.recompress")
                  : t("chat.compressContext")}
            </DropdownMenuItem>
            {window.__TAURI_INTERNALS__ && (
              <>
                <DropdownMenuItem onClick={handlePickWorkspace}>
                  <FolderOpen size={14} className="mr-2" />
                  {conv?.workspaceDir ? t("settings.changeDir") : t("settings.workspaceDir")}
                </DropdownMenuItem>
                {conv?.workspaceDir && (
                  <>
                    <DropdownMenuItem onClick={handleAnalyzeProject}>
                      <Search size={14} className="mr-2" />
                      {t("chat.analyzeProject")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReviewProject}>
                      <FileSearch size={14} className="mr-2" />
                      {t("chat.reviewProject")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleClearWorkspace}>
                      <Trash2 size={14} className="mr-2" />
                      {t("chat.removeWorkspace")}
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t("common.areYouSure"),
                  description: t("chat.clearHistoryConfirm"),
                  destructive: true,
                });
                if (ok) clearConversationMessages(conversationId);
              }}
            >
              <Trash2 size={14} className="mr-2" />
              {t("chat.clearHistory")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Group participants panel */}
      {isGroup && showParticipants && conv && (
        <div className="border-border bg-card flex-shrink-0 border-b px-4 py-2">
          {/* Speaking order toggle */}
          <div className="border-border mb-2 flex items-center gap-2 border-b pb-2">
            <span className="text-muted-foreground text-[11px] font-medium">
              {t("chat.speakingOrder")}
            </span>
            <div className="flex-1" />
            <button
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                (conv.speakingOrder ?? "sequential") === "sequential"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() =>
                useChatStore.getState().updateSpeakingOrder(conversationId, "sequential")
              }
            >
              <ArrowUpDown size={11} /> {t("chat.sequential")}
            </button>
            <button
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                conv.speakingOrder === "random"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() => useChatStore.getState().updateSpeakingOrder(conversationId, "random")}
            >
              <Shuffle size={11} /> {t("chat.random")}
            </button>
            <button
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                conv.speakingOrder === "parallel"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() =>
                useChatStore.getState().updateSpeakingOrder(conversationId, "parallel")
              }
            >
              <Layers size={11} /> {t("chat.parallel")}
            </button>
          </div>
          {/* Group system prompt */}
          <div className="border-border mb-2 border-b pb-2">
            <MentionTextarea
              className="text-foreground placeholder:text-muted-foreground w-full resize-none rounded-lg border-0 bg-transparent px-0 py-1 text-xs leading-relaxed outline-none"
              rows={2}
              placeholder={t("chat.groupPromptPlaceholder")}
              mentions={participantMentions}
              value={groupPromptText}
              onChange={setGroupPromptText}
            />
          </div>
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (over && active.id !== over.id) {
                const ids = conv.participants.map((pp) => pp.id);
                const oldIdx = ids.indexOf(active.id as string);
                const newIdx = ids.indexOf(over.id as string);
                useChatStore
                  .getState()
                  .reorderParticipants(conversationId, arrayMove(ids, oldIdx, newIdx));
              }
            }}
          >
            <SortableContext
              items={conv.participants.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {conv.participants.map((p, idx) => (
                <SortableParticipantRow
                  key={p.id}
                  participant={p}
                  index={idx}
                  allParticipants={conv.participants}
                  getModelById={getModelById}
                  getIdentityById={getIdentityById}
                  onEditRole={() => {
                    setEditingParticipantId(p.id);
                    setShowParticipants(false);
                    setShowIdentityPanel(true);
                  }}
                  onRemove={() => removeParticipant(conversationId, p.id)}
                  isSequential={(conv.speakingOrder ?? "sequential") === "sequential"}
                  onReasoningEffortCycle={() => {
                    updateParticipantReasoningEffort(conversationId, p.id, nextReasoningEffort(p.reasoningEffort));
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            className="border-border text-primary mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs hover:opacity-70"
            onClick={() => setShowAddMemberPicker(true)}
          >
            <Plus size={14} /> {t("chat.addMember")}
          </button>
        </div>
      )}

      {/* Identity panel (single chat or editing group participant) */}
      {showIdentityPanel && (
        <div
          className="border-border bg-card flex-shrink-0 border-b"
          style={{ maxHeight: 240, overflowY: "auto" }}
        >
          <button
            className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-2.5 text-left"
            onClick={() => {
              updateParticipantIdentity(
                conversationId,
                editingParticipantId ?? currentParticipant?.id ?? "",
                null,
              );
              if (editingParticipantId) {
                setShowIdentityPanel(false);
                setShowParticipants(true);
              } else {
                setShowIdentityPanel(false);
              }
              setEditingParticipantId(null);
            }}
          >
            <div className="bg-muted flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full">
              <User size={14} className="text-muted-foreground" />
            </div>
            <span className="text-foreground flex-1 text-[13px]">{t("chat.noIdentity")}</span>
            {!(editingParticipantId
              ? conv?.participants.find((p) => p.id === editingParticipantId)?.identityId
              : currentParticipant?.identityId) && (
              <span className="text-primary text-xs font-semibold">✓</span>
            )}
          </button>
          {identities.map((identity: Identity) => (
            <button
              key={identity.id}
              className="hover:bg-muted/50 border-border/50 flex w-full items-center gap-3 border-t px-4 py-2.5 text-left"
              onClick={() => {
                updateParticipantIdentity(
                  conversationId,
                  editingParticipantId ?? currentParticipant?.id ?? "",
                  identity.id,
                );
                if (editingParticipantId) {
                  setShowIdentityPanel(false);
                  setShowParticipants(true);
                } else {
                  setShowIdentityPanel(false);
                }
                setEditingParticipantId(null);
              }}
            >
              <div className="bg-primary/10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full">
                <span className="text-primary text-[11px] font-bold">
                  {identity.name.slice(0, 1)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-[13px] font-medium">{identity.name}</p>
                {identity.systemPrompt && (
                  <p className="text-muted-foreground truncate text-[11px]">
                    {identity.systemPrompt.slice(0, 60)}
                  </p>
                )}
              </div>
              {(editingParticipantId
                ? conv?.participants.find((p) => p.id === editingParticipantId)?.identityId
                : currentParticipant?.identityId) === identity.id && (
                <span className="text-primary text-xs font-semibold">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelPickerSelect}
      />

      <AddMemberPicker
        open={showAddMemberPicker}
        onClose={() => setShowAddMemberPicker(false)}
        onConfirm={handleAddMembers}
        existingModelIds={conv?.participants.map((p) => p.modelId)}
      />

      {/* Chat */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-0 flex-1"
          onMouseDown={() => {
            setShowParticipants(false);
            setShowIdentityPanel(false);
          }}
        >
          <ChatView
            conversationId={conversationId}
            modelName={!isGroup ? model?.displayName : undefined}
            onSwitchModel={!isGroup ? () => setShowModelPicker(true) : undefined}
            isGroup={isGroup}
            participants={conv?.participants ?? []}
            handleRef={chatViewRef}
            onAtBottomChange={(atBottom) => setShowScrollBottom(!atBottom)}
          />
        </div>
        {/* Error message navigator */}
        {errorMessageIds.length > 0 && !errorNavDismissed && (
          <div
            className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              bottom: 110,
              backgroundColor: "color-mix(in srgb, var(--destructive) 12%, var(--card) 88%)",
              border: "1px solid color-mix(in srgb, var(--destructive) 25%, transparent)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <AlertTriangle size={13} color="var(--destructive)" />
            <span className="text-[12px] font-medium" style={{ color: "var(--destructive)" }}>
              {t("chat.errorCount", { count: errorMessageIds.length })}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => navigateError("prev")}
                className="rounded p-0.5 active:opacity-60"
                style={{ color: "var(--destructive)" }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => navigateError("next")}
                className="rounded p-0.5 active:opacity-60"
                style={{ color: "var(--destructive)" }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button
              onClick={() => setErrorNavDismissed(true)}
              className="rounded p-0.5 active:opacity-60"
              style={{ color: "var(--destructive)" }}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {/* Scroll to bottom — floating above input */}
        <div className="pointer-events-none absolute right-4" style={{ bottom: 100 }}>
          <button
            className="pointer-events-auto flex items-center justify-center rounded-full transition-opacity hover:opacity-100"
            style={{
              width: 32,
              height: 32,
              backgroundColor: "color-mix(in srgb, var(--muted) 85%, var(--background))",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
              opacity: showScrollBottom ? 0.75 : 0,
              transform: showScrollBottom ? "translateY(0) scale(1)" : "translateY(6px) scale(0.9)",
              transition: "opacity 0.2s ease, transform 0.2s ease",
              pointerEvents: showScrollBottom ? "auto" : "none",
            }}
            onClick={() => {
              chatViewRef.current?.scrollToBottom();
              setShowScrollBottom(false);
            }}
          >
            <ArrowDown size={14} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
