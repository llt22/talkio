import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { IoChatbubbles, IoCube, IoPersonCircle, IoSettings, IoChevronBack, IoPeopleOutline, IoCaretDown, IoCaretUp, IoPersonOutline, IoShareOutline, IoCreateOutline, IoSearchOutline, IoCloseCircle, IoSparkles, IoChatbubbleOutline, IoArrowDown, IoAddCircleOutline, IoTrashOutline, IoPersonAddOutline, IoEllipsisHorizontal } from "../../icons";
import { ChatView } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { MobileStack } from "./MobileStack";
import { SettingsMainContent } from "./SettingsMainContent";
import { DiscoverPage } from "../../pages/DiscoverPage";
import { ModelsPage } from "../../pages/settings/ModelsPage";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useConversations } from "../../hooks/useDatabase";
import { useChatPanelState } from "../../hooks/useChatPanelState";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";
import type { Conversation, ConversationParticipant, Identity } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { exportConversationAsMarkdown } from "../../services/export";
import i18n from "../../i18n";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";

// ── Tab Icons ──

function IonChatbubbles() {
  return <IoChatbubbles size={22} />;
}
function IonCube() {
  return <IoCube size={22} />;
}
function IonPersonCircle() {
  return <IoPersonCircle size={22} />;
}
function IonSettings() {
  return <IoSettings size={22} />;
}

type MobileTab = "chats" | "experts" | "discover" | "settings";

const TAB_IDS: { id: MobileTab; Icon: React.FC; labelKey: string }[] = [
  { id: "chats", Icon: IonChatbubbles, labelKey: "tabs.chats" },
  { id: "experts", Icon: IonCube, labelKey: "tabs.models" },
  { id: "discover", Icon: IonPersonCircle, labelKey: "tabs.personas" },
  { id: "settings", Icon: IonSettings, labelKey: "tabs.settings" },
];

const MOBILE_ACTIVE_TAB_KEY = "talkio:mobile_active_tab";

function loadInitialMobileTab(): MobileTab {
  try {
    const v = sessionStorage.getItem(MOBILE_ACTIVE_TAB_KEY);
    if (v === "chats" || v === "experts" || v === "discover" || v === "settings") return v;
  } catch {
    // ignore
  }
  return "chats";
}

export function MobileLayout() {
  return <MobileStack />;
}

// ── Tab Layout ──

export function MobileTabLayout() {
  const { t } = useTranslation();
  const [activeTab, setActiveTabState] = useState<MobileTab>(() => loadInitialMobileTab());
  const setActiveTab = useCallback((tab: MobileTab) => {
    try { sessionStorage.setItem(MOBILE_ACTIVE_TAB_KEY, tab); } catch { /* ignore */ }
    setActiveTabState(tab);
  }, []);
  const tabBg = "var(--background)";

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: tabBg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Tab Content — keep all tabs mounted, hide inactive with display:none to preserve state */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className="absolute inset-0" style={{ display: activeTab === "chats" ? undefined : "none" }}>
          <MobileConversationList onNavigateToExperts={() => setActiveTab("experts")} onNavigateToSettings={() => setActiveTab("settings")} />
        </div>
        <div className="absolute inset-0" style={{ display: activeTab === "experts" ? undefined : "none" }}>
          <ModelsPage isMobile />
        </div>
        <div className="absolute inset-0" style={{ display: activeTab === "discover" ? undefined : "none" }}>
          <DiscoverPage />
        </div>
        <div className="absolute inset-0" style={{ display: activeTab === "settings" ? undefined : "none" }}>
          <SettingsMainContent />
        </div>
      </div>

      {/* Bottom Tab Bar — iOS native style */}
      <div
        className="flex-shrink-0 flex items-center justify-around px-2 pt-1.5"
        style={{
          paddingBottom: "max(6px, env(safe-area-inset-bottom, 6px))",
          borderTop: "0.5px solid var(--border)",
          backgroundColor: "var(--background)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        }}
      >
        {TAB_IDS.map(({ id, Icon, labelKey }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex flex-col items-center gap-[1px] py-0.5 min-w-[64px]"
            style={{ color: activeTab === id ? "var(--primary)" : "var(--muted-foreground)" }}
          >
            <Icon />
            <span className="text-[10px] font-medium leading-tight">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Chat Detail (1:1 RN ChatDetailScreen) ──

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
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollToBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

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
            onEditRole={(pid) => { setEditingParticipantId(pid); setShowParticipants(false); setShowIdentityPanel(true); }}
            onRemove={async (pid, name) => {
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
          onScrollRef={scrollRef}
          onScroll={handleScroll}
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
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

// ── Chats List (1:1 RN original) ──

type FilterType = "all" | "single" | "group";

function MobileConversationList({ onNavigateToExperts, onNavigateToSettings }: { onNavigateToExperts: () => void; onNavigateToSettings: () => void }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const mobileNav = useMobileNav();
  const conversations = useConversations();
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const hasProviders = providers.some((p) => (p.status as string) === "active" || p.status === "connected");

  const filtered = useMemo(() => conversations.filter((c: Conversation) => {
    if (filter === "single" && c.type !== "single") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(q);
      const matchLastMsg = c.lastMessage?.toLowerCase().includes(q);
      if (!matchTitle && !matchLastMsg) return false;
    }
    return true;
  }), [conversations, filter, searchQuery]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("tabs.chats")}</h1>
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
          >
            <IoSearchOutline size={22} color="var(--primary)" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 pb-2">
          <div className="flex items-center rounded-xl px-3 py-2" style={{ backgroundColor: "var(--secondary)" }}>
            <IoSearchOutline size={18} color="var(--muted-foreground)" />
            <input
              className="ml-2 flex-1 text-[15px] text-foreground bg-transparent outline-none"
              placeholder={t("chats.searchChats")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="active:opacity-60">
                <IoCloseCircle size={18} color="var(--muted-foreground)" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Pills (1:1 RN — filters by conv.type) */}
      <div className="px-4 pb-3">
        <div className="flex gap-2">
          {(["all", "single", "group"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold active:opacity-70 transition-colors ${
                filter === f
                  ? "text-white"
                  : "text-foreground"
              }`}
              style={{
                backgroundColor: filter === f ? "var(--primary)" : "var(--secondary)",
              }}
            >
              {f === "all" ? t("chats.filterAll") : f === "single" ? t("chats.filterSingle") : t("chats.filterGroups")}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {filtered.length === 0 ? (
          <OnboardingOrEmpty hasProviders={hasProviders} onNew={onNavigateToExperts} onNavigateToSettings={onNavigateToSettings} />
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              onSelect={() => mobileNav?.pushChat(conv.id)}
              onDelete={async () => {
                const ok = await confirm({
                  title: t("chat.deleteConversation"),
                  description: t("chat.deleteConversationConfirm"),
                  destructive: true,
                });
                if (ok) deleteConversation(conv.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Onboarding / Empty State (1:1 RN original) ──

function OnboardingOrEmpty({ hasProviders, onNew, onNavigateToSettings }: { hasProviders: boolean; onNew: () => void; onNavigateToSettings: () => void }) {
  const { t } = useTranslation();
  if (!hasProviders) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <img src="/logo.png" alt="Talkio" className="mb-6 h-20 w-20 object-contain" />
        <p className="text-center text-xl font-bold text-foreground">{t("settings.appName")}</p>
        <p className="mt-3 text-center text-sm leading-5 text-muted-foreground">
          {t("models.configureHint")}
        </p>
        <button
          onClick={onNavigateToSettings}
          className="mt-6 rounded-xl px-8 py-3 active:opacity-80 text-base font-semibold text-white"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {t("models.configureProvider")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <img src="/logo.png" alt="Talkio" className="h-14 w-14 object-contain opacity-40" />
      <p className="mt-3 text-center text-sm text-muted-foreground">{t("chats.noConversations")}</p>
      <button
        onClick={onNew}
        className="mt-4 rounded-full px-6 py-2.5 active:opacity-80 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--primary)" }}
      >
        {t("chats.startConversation")}
      </button>
    </div>
  );
}

// ── Drag-sortable participant list (mobile) ──

function MobileSortableRow({
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
    <div ref={setNodeRef} style={style} className="flex items-center gap-2.5 py-2">
      {isSequential && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 touch-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="5" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="5" r="1.5" fill="var(--muted-foreground)"/><circle cx="8" cy="12" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="12" r="1.5" fill="var(--muted-foreground)"/><circle cx="8" cy="19" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="19" r="1.5" fill="var(--muted-foreground)"/></svg>
        </button>
      )}
      <span className="text-[11px] text-muted-foreground w-4 text-center flex-shrink-0">{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
      </div>
      <button
        className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] active:opacity-60"
        style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)", color: "var(--primary)" }}
        onClick={onEditRole}
      >
        {pIdentity ? pIdentity.name : t("chat.noIdentity")}
      </button>
      <button className="p-1 active:opacity-60 flex-shrink-0" onClick={onRemove}>
        <IoTrashOutline size={15} color="var(--destructive)" />
      </button>
    </div>
  );
}

function MobileDndParticipantList({
  participants,
  conversationId,
  isSequential,
  getModelById,
  getIdentityById,
  onEditRole,
  onRemove,
}: {
  participants: ConversationParticipant[];
  conversationId: string;
  isSequential: boolean;
  getModelById: (id: string) => any;
  getIdentityById: (id: string) => any;
  onEditRole: (participantId: string) => void;
  onRemove: (participantId: string, displayName: string) => void;
}) {
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
          const ids = participants.map((pp) => pp.id);
          const oldIdx = ids.indexOf(active.id as string);
          const newIdx = ids.indexOf(over.id as string);
          useChatStore.getState().reorderParticipants(conversationId, arrayMove(ids, oldIdx, newIdx));
        }
      }}
    >
      <SortableContext items={participants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {participants.map((p, idx) => (
          <MobileSortableRow
            key={p.id}
            participant={p}
            index={idx}
            getModelById={getModelById}
            getIdentityById={getIdentityById}
            onEditRole={() => onEditRole(p.id)}
            onRemove={() => {
              const m = getModelById(p.modelId);
              onRemove(p.id, m?.displayName ?? p.modelId);
            }}
            isSequential={isSequential}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// ── Conversation Item (1:1 RN original with ModelAvatar + status dot) ──

function ConversationItem({
  conversation,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const getModelById = useProviderStore((s) => s.getModelById);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const firstParticipant = conversation.participants[0];
  const firstModel = firstParticipant ? getModelById(firstParticipant.modelId) : null;
  const modelName = firstModel?.displayName ?? conversation.title;
  const provider = firstModel ? getProviderById(firstModel.providerId) : null;
  const isConnected = provider?.status === "connected" || (provider?.status as string) === "active";
  const identity = firstParticipant?.identityId
    ? getIdentityById(firstParticipant.identityId)
    : null;
  const isGroup = conversation.type === "group";

  const timeStr = formatDate(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt ?? "");
  const { color: avatarColor, initials } = getAvatarProps(modelName);

  const handleTouchStart = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onDelete();
    }, 500);
  }, [onDelete]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (didLongPress.current) return;
    onSelect();
  }, [onSelect]);

  return (
    <button
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); onDelete(); }}
      className="w-full flex items-center gap-4 px-4 py-3 text-left active:opacity-80 transition-colors"
      style={{ borderBottom: "0.5px solid var(--border)" }}
    >
      {/* Avatar with status dot (1:1 RN) */}
      <div className="relative flex-shrink-0">
        {isGroup ? (
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)" }}
          >
            <IoPeopleOutline size={22} color="var(--primary)" />
          </div>
        ) : (
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-semibold"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
        )}
        {!isGroup && firstModel && (
          <div
            className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2"
            style={{
              borderColor: "var(--background)",
              backgroundColor: isConnected ? "var(--success)" : "var(--border)",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[16px] font-semibold text-foreground truncate flex-1">
            {isGroup ? conversation.title : modelName}
          </span>
          <span className="ml-2 text-xs text-muted-foreground flex-shrink-0">{timeStr}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {identity ? `${identity.name}: ` : ""}
          {conversation.lastMessage ?? t("chats.startConversation")}
        </p>
      </div>
    </button>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return i18n.t("common.yesterday", { defaultValue: "Yesterday" });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

