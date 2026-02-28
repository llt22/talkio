import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { IoChevronBack, IoPeopleOutline, IoCaretDown, IoCaretUp, IoPersonOutline, IoShareOutline, IoCreateOutline, IoArrowDown, IoAddCircleOutline, IoTrashOutline, IoPersonAddOutline, IoEllipsisHorizontal } from "../../icons";
import { ChatView, type ChatViewHandle } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { useChatStore } from "../../stores/chat-store";
import { useChatPanelState } from "../../hooks/useChatPanelState";
import type { Identity } from "../../types";
import { exportConversationAsMarkdown } from "../../services/export";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { MobileDndParticipantList } from "./MobileDndParticipantList";

export function MobileChatDetail({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const mobileNav = useMobileNav();
  const keyboardHeight = useKeyboardHeight();
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
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const chatViewRef = useRef<ChatViewHandle>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Optimistic identity id — updates immediately on selection, before DB roundtrip
  const [optimisticIdentityId, setOptimisticIdentityId] = useState<string | null | undefined>(undefined);

  const resolvedIdentityId = optimisticIdentityId !== undefined ? optimisticIdentityId : currentParticipant?.identityId ?? null;
  const activeIdentity = resolvedIdentityId ? getIdentityById(resolvedIdentityId) : null;

  const editingParticipant = useMemo(() => {
    if (!editingParticipantId || !conv) return null;
    return conv.participants.find((p) => p.id === editingParticipantId) ?? null;
  }, [conv, editingParticipantId]);

  const identityPanelIdentityId = editingParticipantId
    ? (editingParticipant?.identityId ?? null)
    : resolvedIdentityId;

  // Sync optimistic state when conv updates from DB
  useEffect(() => {
    setOptimisticIdentityId(undefined);
  }, [currentParticipant?.identityId]);

  const title = isGroup
    ? conv?.title ?? t("chat.group")
    : model?.displayName ?? t("chat.chatTitle");

  const subtitle = isGroup
    ? t("chat.modelCount", { count: conv?.participants.length ?? 0 })
    : activeIdentity?.name ?? t("chat.mountIdentity");


  const handleHeaderTitlePress = useCallback(() => {
    if (isGroup) {
      setShowParticipants((v) => !v);
      setShowIdentityPanel(false);
    } else {
      setShowIdentityPanel((v) => !v);
      setShowParticipants(false);
    }
  }, [isGroup]);

  const handleIdentitySelect = useCallback((identityId: string | null) => {
    const targetId = editingParticipantId ?? currentParticipant?.id;
    if (targetId) {
      // Optimistic update for instant subtitle refresh
      if (!editingParticipantId) setOptimisticIdentityId(identityId);
      updateParticipantIdentity(conversationId, targetId, identityId);
    }
    if (editingParticipantId) {
      // Group member role edit: return to participants panel
      setShowIdentityPanel(false);
      setShowParticipants(true);
    } else {
      // Single chat identity change: just close
      setShowIdentityPanel(false);
    }
    setEditingParticipantId(null);
  }, [conversationId, editingParticipantId, currentParticipant, updateParticipantIdentity]);

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
        exportedFooter: `*Exported from Talkio · ${new Date().toLocaleDateString()}*`,
      });
    } finally {
      setIsExporting(false);
    }
  }, [conv, messages, isExporting, t]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
      {/* Header */}
      <div className="flex-shrink-0 relative flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)", borderBottom: "0.5px solid var(--border)" }}>
        <button className="flex items-center gap-0.5 px-2 py-1 active:opacity-60 z-10" onClick={onBack}>
          <IoChevronBack size={20} color="var(--primary)" />
        </button>

        {/* Tappable center title — absolute centered, symmetric padding matches button widths */}
        {isEditingTitle ? (
          <div className="absolute inset-y-0 flex items-center justify-center" style={{ left: 48, right: 48 }}>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => { renameConversation(conversationId, editTitle); setIsEditingTitle(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { renameConversation(conversationId, editTitle); setIsEditingTitle(false); } if (e.key === "Escape") setIsEditingTitle(false); }}
              className="text-sm font-bold text-foreground bg-transparent border-b border-primary outline-none text-center w-full mx-4"
            />
          </div>
        ) : (
        <button
          className="absolute inset-y-0 flex flex-col items-center justify-center active:opacity-70"
          style={{ left: 48, right: 48 }}
          onClick={handleHeaderTitlePress}
        >
          <span className="text-sm font-bold tracking-tight text-foreground truncate max-w-full">{title}</span>
          <div className="mt-0.5 flex items-center gap-1 max-w-full">
            {isGroup ? <IoPeopleOutline size={12} color="var(--primary)" className="flex-shrink-0" /> : <IoPersonOutline size={12} color="var(--primary)" className="flex-shrink-0" />}
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary truncate">{subtitle}</span>
            {isGroup
              ? (showParticipants ? <IoCaretUp size={12} color="var(--primary)" className="flex-shrink-0" /> : <IoCaretDown size={12} color="var(--primary)" className="flex-shrink-0" />)
              : (showIdentityPanel ? <IoCaretUp size={12} color="var(--primary)" className="flex-shrink-0" /> : <IoCaretDown size={12} color="var(--primary)" className="flex-shrink-0" />)
            }
          </div>
        </button>
        )}

        {/* Right: single ··· more button */}
        <div className="ml-auto z-10 relative">
          <button
            className="p-2 active:opacity-60"
            onClick={() => setShowMoreMenu((v) => !v)}
          >
            <IoEllipsisHorizontal size={22} color="var(--primary)" />
          </button>

          {/* Dropdown menu */}
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-xl py-1 shadow-lg"
                style={{ backgroundColor: "var(--card)", border: "0.5px solid var(--border)" }}
              >
                {isGroup && (
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
                    onClick={() => { setShowMoreMenu(false); setEditTitle(conv?.title ?? ""); setIsEditingTitle(true); }}
                  >
                    <IoCreateOutline size={18} color="var(--foreground)" />
                    <span className="text-[14px] text-foreground">{t("chat.rename")}</span>
                  </button>
                )}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
                  onClick={() => { setShowMoreMenu(false); mobileNav?.pushAddMember(conversationId); }}
                >
                  <IoPersonAddOutline size={18} color="var(--foreground)" />
                  <span className="text-[14px] text-foreground">{t("chat.addMember")}</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
                  style={{ opacity: messages.length === 0 ? 0.4 : 1 }}
                  disabled={messages.length === 0 || isExporting}
                  onClick={() => { setShowMoreMenu(false); handleExport(); }}
                >
                  <IoShareOutline size={18} color="var(--foreground)" />
                  <span className="text-[14px] text-foreground">{t("chat.export")}</span>
                </button>
                <div style={{ height: "0.5px", backgroundColor: "var(--border)", margin: "0 16px" }} />
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
                  onClick={async () => {
                    setShowMoreMenu(false);
                    const ok = await confirm({
                      title: t("common.areYouSure"),
                      description: t("chat.clearHistoryConfirm"),
                      destructive: true,
                    });
                    if (ok) clearConversationMessages(conversationId);
                  }}
                >
                  <IoTrashOutline size={18} color="var(--destructive)" />
                  <span className="text-[14px]" style={{ color: "var(--destructive)" }}>{t("chat.clearHistory")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Group participant panel */}
      {isGroup && showParticipants && conv && (
        <div className="flex-shrink-0 border-b px-4 py-2" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          {/* Speaking order toggle */}
          <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: "0.5px solid var(--border)" }}>
            <span className="text-[11px] text-muted-foreground font-medium">{t("chat.speakingOrder")}</span>
            <div className="flex-1" />
            <button
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium active:opacity-60 ${
                (conv.speakingOrder ?? "sequential") === "sequential" ? "text-primary" : "text-muted-foreground"
              }`}
              style={(conv.speakingOrder ?? "sequential") === "sequential" ? { backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" } : {}}
              onClick={() => useChatStore.getState().updateSpeakingOrder(conversationId, "sequential")}
            >
              {t("chat.sequential")}
            </button>
            <button
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium active:opacity-60 ${
                conv.speakingOrder === "random" ? "text-primary" : "text-muted-foreground"
              }`}
              style={conv.speakingOrder === "random" ? { backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" } : {}}
              onClick={() => useChatStore.getState().updateSpeakingOrder(conversationId, "random")}
            >
              {t("chat.random")}
            </button>
          </div>
          <MobileDndParticipantList
            participants={conv.participants}
            conversationId={conversationId}
            isSequential={(conv.speakingOrder ?? "sequential") === "sequential"}
            getModelById={getModelById}
            getIdentityById={getIdentityById}
            onEditRole={(pid: string) => { setEditingParticipantId(pid); setShowParticipants(false); setShowIdentityPanel(true); }}
            onRemove={async (pid: string, name: string) => {
              const ok = await confirm({ title: t("common.areYouSure"), description: `${t("chat.removeMember")}: ${name}`, destructive: true });
              if (ok) removeParticipant(conversationId, pid);
            }}
          />
          <button
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mt-1 mb-1 border border-dashed active:opacity-60"
            style={{ borderColor: "var(--border)" }}
            onClick={() => mobileNav?.pushAddMember(conversationId)}
          >
            <IoAddCircleOutline size={18} color="var(--primary)" />
            <span className="text-[13px] font-medium text-primary">{t("chat.addMember")}</span>
          </button>
        </div>
      )}

      {/* Identity selection panel (single chat) */}
      {showIdentityPanel && (
        <div className="flex-shrink-0 border-b" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", maxHeight: 260, overflowY: "auto" }}>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
            style={{ borderBottom: "0.5px solid var(--border)" }}
            onClick={() => handleIdentitySelect(null)}
          >
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--secondary)" }}>
              <IoPersonOutline size={16} color="var(--muted-foreground)" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[14px] font-medium text-foreground">{t("chat.noIdentity")}</p>
            </div>
            {!identityPanelIdentityId && <span className="text-xs text-primary font-semibold">✓</span>}
          </button>
          {identities.map((identity: Identity) => (
            <button
              key={identity.id}
              className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60"
              style={{ borderBottom: "0.5px solid var(--border)" }}
              onClick={() => handleIdentitySelect(identity.id)}
            >
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>
                <span className="text-primary font-bold">{identity.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[14px] font-medium text-foreground truncate">{identity.name}</p>
                {identity.systemPrompt && (
                  <p className="text-[12px] text-muted-foreground truncate">{identity.systemPrompt.slice(0, 60)}</p>
                )}
              </div>
              {identityPanelIdentityId === identity.id && <span className="text-xs text-primary font-semibold">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* ModelPicker */}
      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelPickerSelect}
        multiSelect={modelPickerMode === "add"}
        onMultiSelect={handleMultiModelSelect}
      />

      {/* Messages + Input */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <ChatView
          conversationId={conversationId}
          isMobile
          handleRef={chatViewRef}
          onAtBottomChange={(atBottom) => setShowScrollToBottom(!atBottom)}
          modelName={!isGroup ? model?.displayName : undefined}
          onSwitchModel={!isGroup ? () => { setModelPickerMode("switch"); setShowModelPicker(true); } : undefined}
          isGroup={isGroup}
          participants={conv?.participants ?? []}
        />
        {/* Scroll to bottom — floating above input */}
        <div
          className="absolute right-3 pointer-events-none"
          style={{ bottom: 160 }}
        >
          <button
            className="pointer-events-auto flex items-center justify-center rounded-full active:scale-95"
            style={{
              width: 36,
              height: 36,
              backgroundColor: "color-mix(in srgb, var(--muted) 85%, var(--background))",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
              opacity: showScrollToBottom ? 0.85 : 0,
              transform: showScrollToBottom ? "translateY(0) scale(1)" : "translateY(6px) scale(0.9)",
              transition: "opacity 0.2s ease, transform 0.2s ease",
              pointerEvents: showScrollToBottom ? "auto" : "none",
            }}
            onClick={() => {
              chatViewRef.current?.scrollToBottom();
              setShowScrollToBottom(false);
            }}
          >
            <IoArrowDown size={16} color="var(--muted-foreground)" />
          </button>
        </div>
      </div>
    </div>
  );
}
