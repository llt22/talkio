import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Trash2, UserPlus, Share2, ChevronDown, ChevronUp, User, Users, Pencil, ArrowDown, ArrowUpDown, Shuffle, GripVertical, Plus, Minimize2 } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChatView, type ChatViewHandle } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { AddMemberPicker } from "../shared/AddMemberPicker";
import { useChatStore } from "../../stores/chat-store";
import { manualCompress, setManualSummary, getManualSummary } from "../../lib/context-compression";
import { buildApiMessagesForParticipant } from "../../stores/chat-message-builder";
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
import type { ConversationParticipant, Identity } from "../../types";
import { exportConversationAsMarkdown } from "../../services/export";
import { useConfirm } from "../shared/ConfirmDialogProvider";

// ── Drag-sortable participant row ──

function SortableParticipantRow({
  participant: p,
  index: idx,
  getModelById,
  getIdentityById,
  onEditRole,
  onRemove,
  isSequential,
}: {
  participant: ConversationParticipant;
  index: number;
  getModelById: (id: string) => any;
  getIdentityById: (id: string) => any;
  onEditRole: () => void;
  onRemove: () => void;
  isSequential: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const pModel = getModelById(p.modelId);
  const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
  const displayName = pModel?.displayName ?? p.modelId;
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 py-2">
      {isSequential && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 hover:opacity-70">
          <GripVertical size={14} className="text-muted-foreground" />
        </button>
      )}
      <span className="text-[11px] text-muted-foreground w-4 text-center flex-shrink-0">{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
      </div>
      <button
        className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] hover:opacity-80 transition-opacity"
        style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)", color: "var(--primary)" }}
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
  const {
    conv,
    messages,
    identities,
    getModelById,
    getIdentityById,
    clearConversationMessages,
    updateParticipantIdentity,
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
    setModelPickerMode,
    isExporting,
    setIsExporting,
    handleModelPickerSelect,
    handleMultiModelSelect,
    handleAddMembers,
    modelPickerMode,
    showAddMemberPicker,
    setShowAddMemberPicker,
  } = useChatPanelState(conversationId);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const title = isGroup ? conv?.title ?? t("chat.group") : model?.displayName ?? t("chat.chatTitle");
  const subtitle = isGroup
    ? t("chat.modelCount", { count: conv?.participants.length ?? 0 })
    : activeIdentity?.name ?? t("chat.mountIdentity");

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
      await (await import("../../components/shared/ConfirmDialogProvider")).appAlert(
        `${t("chat.compressSuccess")}\n${result.originalTokens} → ${result.compressedTokens} tokens (${pct}% ${t("chat.reduction")})`,
      );
    } catch (err) {
      await (await import("../../components/shared/ConfirmDialogProvider")).appAlert(
        `${t("chat.compressFailed")}: ${err instanceof Error ? err.message : "Unknown"}`,
      );
    } finally {
      setIsCompressing(false);
    }
  }, [conv, messages, isCompressing, conversationId, t]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); renameConversation(conversationId, editTitle); setIsEditingTitle(false); }}
            >
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => { renameConversation(conversationId, editTitle); setIsEditingTitle(false); }}
                onKeyDown={(e) => { if (e.key === "Escape") setIsEditingTitle(false); }}
                className="text-sm font-semibold text-foreground bg-transparent border-b border-primary outline-none w-48"
              />
            </form>
          ) : (
          <button
            className="flex items-center gap-1.5 hover:opacity-70 transition-opacity text-left"
            onClick={() => {
              if (isGroup) { setShowParticipants((v) => !v); setShowIdentityPanel(false); }
              else { setShowIdentityPanel((v) => !v); setShowParticipants(false); }
            }}
          >
            <span className="text-sm font-semibold text-foreground truncate">{title}</span>
            <span className="text-xs text-muted-foreground truncate">·</span>
            {isGroup ? <Users size={12} className="text-primary flex-shrink-0" /> : <User size={12} className="text-primary flex-shrink-0" />}
            <span className="text-xs text-primary truncate">{subtitle}</span>
            {(showIdentityPanel || showParticipants) ? <ChevronUp size={12} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />}
          </button>
          )}
          {isGroup && !isEditingTitle && (
            <button
              className="ml-1 hover:opacity-70 flex-shrink-0"
              onClick={() => { setEditTitle(conv?.title ?? ""); setIsEditingTitle(true); }}
            >
              <Pencil size={12} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {isCompressing && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg animate-pulse" style={{ backgroundColor: "var(--secondary)" }}>
            <Minimize2 size={12} className="text-primary animate-spin" style={{ animationDuration: "2s" }} />
            <span className="text-[11px] text-primary font-medium">{t("chat.compressing")}</span>
          </div>
        )}
        {hasManualSummary && !isCompressing && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)" }}>
            <Minimize2 size={11} className="text-primary" />
            <span className="text-[10px] text-primary font-medium">{t("chat.compressed")}</span>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => { setModelPickerMode("add"); setShowModelPicker(true); }}>
              <UserPlus size={14} className="mr-2" />
              {t("chat.addMember")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport} disabled={messages.length === 0 || isExporting}>
              <Share2 size={14} className="mr-2" />
              {t("chat.export")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCompress} disabled={messages.length < 4 || isCompressing}>
              <Minimize2 size={14} className="mr-2" />
              {isCompressing ? t("chat.compressing") : hasManualSummary ? t("chat.recompress") : t("chat.compressContext")}
            </DropdownMenuItem>
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
        <div className="flex-shrink-0 border-b border-border bg-card px-4 py-2">
          {/* Speaking order toggle */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
            <span className="text-[11px] text-muted-foreground font-medium">{t("chat.speakingOrder")}</span>
            <div className="flex-1" />
            <button
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                (conv.speakingOrder ?? "sequential") === "sequential" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() => useChatStore.getState().updateSpeakingOrder(conversationId, "sequential")}
            >
              <ArrowUpDown size={11} /> {t("chat.sequential")}
            </button>
            <button
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                conv.speakingOrder === "random" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() => useChatStore.getState().updateSpeakingOrder(conversationId, "random")}
            >
              <Shuffle size={11} /> {t("chat.random")}
            </button>
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
                useChatStore.getState().reorderParticipants(conversationId, arrayMove(ids, oldIdx, newIdx));
              }
            }}
          >
            <SortableContext items={conv.participants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {conv.participants.map((p, idx) => (
                <SortableParticipantRow
                  key={p.id}
                  participant={p}
                  index={idx}
                  getModelById={getModelById}
                  getIdentityById={getIdentityById}
                  onEditRole={() => { setEditingParticipantId(p.id); setShowParticipants(false); setShowIdentityPanel(true); }}
                  onRemove={() => removeParticipant(conversationId, p.id)}
                  isSequential={(conv.speakingOrder ?? "sequential") === "sequential"}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 mt-1 text-xs text-primary hover:opacity-70"
            onClick={() => setShowAddMemberPicker(true)}
          >
            <Plus size={14} /> {t("chat.addMember")}
          </button>
        </div>
      )}

      {/* Identity panel (single chat or editing group participant) */}
      {showIdentityPanel && (
        <div className="flex-shrink-0 border-b border-border bg-card" style={{ maxHeight: 240, overflowY: "auto" }}>
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left"
            onClick={() => { updateParticipantIdentity(conversationId, editingParticipantId ?? currentParticipant?.id ?? "", null); if (editingParticipantId) { setShowIdentityPanel(false); setShowParticipants(true); } else { setShowIdentityPanel(false); } setEditingParticipantId(null); }}
          >
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-muted-foreground" />
            </div>
            <span className="text-[13px] text-foreground flex-1">{t("chat.noIdentity")}</span>
            {!(editingParticipantId ? conv?.participants.find((p) => p.id === editingParticipantId)?.identityId : currentParticipant?.identityId) && <span className="text-xs text-primary font-semibold">✓</span>}
          </button>
          {identities.map((identity: Identity) => (
            <button
              key={identity.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left border-t border-border/50"
              onClick={() => { updateParticipantIdentity(conversationId, editingParticipantId ?? currentParticipant?.id ?? "", identity.id); if (editingParticipantId) { setShowIdentityPanel(false); setShowParticipants(true); } else { setShowIdentityPanel(false); } setEditingParticipantId(null); }}
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-primary">{identity.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{identity.name}</p>
                {identity.systemPrompt && <p className="text-[11px] text-muted-foreground truncate">{identity.systemPrompt.slice(0, 60)}</p>}
              </div>
              {(editingParticipantId ? conv?.participants.find((p) => p.id === editingParticipantId)?.identityId : currentParticipant?.identityId) === identity.id && <span className="text-xs text-primary font-semibold">✓</span>}
            </button>
          ))}
        </div>
      )}

      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelPickerSelect}
        multiSelect={modelPickerMode === "add"}
        onMultiSelect={handleMultiModelSelect}
      />

      <AddMemberPicker
        open={showAddMemberPicker}
        onClose={() => setShowAddMemberPicker(false)}
        onConfirm={handleAddMembers}
      />

      {/* Chat */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <div className="flex-1 min-h-0">
          <ChatView
            conversationId={conversationId}
            modelName={!isGroup ? model?.displayName : undefined}
            onSwitchModel={!isGroup ? () => { setModelPickerMode("switch"); setShowModelPicker(true); } : undefined}
            isGroup={isGroup}
            participants={conv?.participants ?? []}
            handleRef={chatViewRef}
            onAtBottomChange={(atBottom) => setShowScrollBottom(!atBottom)}
          />
        </div>
        {/* Scroll to bottom — floating above input */}
        <div
          className="absolute right-4 pointer-events-none"
          style={{ bottom: 100 }}
        >
          <button
            className="pointer-events-auto flex items-center justify-center rounded-full hover:opacity-100 transition-opacity"
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
            onClick={() => { chatViewRef.current?.scrollToBottom(); setShowScrollBottom(false); }}
          >
            <ArrowDown size={14} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
