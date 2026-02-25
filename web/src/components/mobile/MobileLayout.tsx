import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { IoChatbubbles, IoCube, IoPersonCircle, IoSettings, IoChevronBack, IoPeopleOutline, IoCaretDown, IoCaretUp, IoPersonOutline, IoShareOutline, IoCreateOutline, IoSearchOutline, IoCloseCircle, IoSparkles, IoChatbubbleOutline, IoArrowDown, IoAddCircleOutline, IoTrashOutline, IoPersonAddOutline } from "react-icons/io5";
import { ChatView } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { SettingsPage } from "../../pages/settings/SettingsPage";
import { DiscoverPage } from "../../pages/DiscoverPage";
import { ModelsPage } from "../../pages/settings/ModelsPage";
import { IdentityEditPage } from "../../pages/settings/IdentityPage";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useConversations } from "../../hooks/useDatabase";
import { useChatPanelState } from "../../hooks/useChatPanelState";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";
import type { Conversation, Identity } from "../../../../src/types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { exportConversationAsMarkdown } from "../../services/export";

// ── Tab Icons using react-icons/io5 ──

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
  return (
    <Routes>
      <Route path="/chat/:id" element={<MobileChatDetailRoute />} />
      <Route path="/identity/new" element={<IdentityEditPage />} />
      <Route path="/identity/edit/:id" element={<IdentityEditPage />} />
      <Route path="*" element={<MobileTabLayout />} />
    </Routes>
  );
}

// ── Chat Detail Route (uses react-router for back navigation) ──

function MobileChatDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);

  // Sync store with route param
  useEffect(() => {
    if (id) setCurrentConversation(id);
    return () => setCurrentConversation(null);
  }, [id, setCurrentConversation]);

  if (!id) return null;
  return <MobileChatDetail conversationId={id} onBack={() => navigate(-1)} />;
}

// ── Tab Layout ──

function MobileTabLayout() {
  const { t } = useTranslation();
  const [activeTab, setActiveTabState] = useState<MobileTab>(() => loadInitialMobileTab());
  const setActiveTab = useCallback((tab: MobileTab) => {
    try { sessionStorage.setItem(MOBILE_ACTIVE_TAB_KEY, tab); } catch { /* ignore */ }
    setActiveTabState(tab);
  }, []);
  const tabBg = "var(--background)";

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: tabBg }}>
      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "chats" && <MobileConversationList onNavigateToExperts={() => setActiveTab("experts")} />}
        {activeTab === "experts" && <ModelsPage />}
        {activeTab === "discover" && <DiscoverPage />}
        {activeTab === "settings" && <SettingsPage />}
      </div>

      {/* Bottom Tab Bar — iOS native style */}
      <div
        className="flex-shrink-0 flex items-center justify-around px-2 pt-1.5"
        style={{
          paddingBottom: 0,
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

function MobileChatDetail({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { t } = useTranslation();
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
  } = useChatPanelState(conversationId);

  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
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
    setShowIdentityPanel(false);
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
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <div className="flex-shrink-0 relative flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)", borderBottom: "0.5px solid var(--border)" }}>
        <button className="flex items-center gap-0.5 px-2 py-1 active:opacity-60 z-10" onClick={onBack}>
          <IoChevronBack size={20} color="var(--primary)" />
        </button>

        {/* Tappable center title */}
        <button
          className="absolute inset-x-0 flex flex-col items-center active:opacity-70"
          onClick={handleHeaderTitlePress}
        >
          <span className="text-sm font-bold tracking-tight text-foreground truncate max-w-[200px]">{title}</span>
          <div className="mt-0.5 flex items-center gap-1">
            {isGroup ? <IoPeopleOutline size={12} color="var(--primary)" /> : <IoPersonOutline size={12} color="var(--primary)" />}
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{subtitle}</span>
            {isGroup
              ? (showParticipants ? <IoCaretUp size={12} color="var(--primary)" /> : <IoCaretDown size={12} color="var(--primary)" />)
              : (showIdentityPanel ? <IoCaretUp size={12} color="var(--primary)" /> : <IoCaretDown size={12} color="var(--primary)" />)
            }
          </div>
        </button>

        {/* Right buttons */}
        <div className="ml-auto flex items-center gap-1 z-10">
          <button
            className="p-2 active:opacity-60"
            onClick={() => { setModelPickerMode("add"); setShowModelPicker(true); }}
          >
            <IoPersonAddOutline size={19} color="var(--primary)" />
          </button>
          <button
            className="p-2 active:opacity-60"
            style={{ opacity: messages.length === 0 ? 0.3 : 1 }}
            onClick={handleExport}
            disabled={messages.length === 0 || isExporting}
          >
            <IoShareOutline size={20} color="var(--primary)" />
          </button>
          <button
            className="p-2 active:opacity-60"
            onClick={() => { if (confirm(t("chat.clearHistoryConfirm"))) clearConversationMessages(conversationId); }}
          >
            <IoCreateOutline size={20} color="var(--primary)" />
          </button>
        </div>
      </div>

      {/* Group participant panel */}
      {isGroup && showParticipants && conv && (
        <div className="flex-shrink-0 border-b px-4 py-2" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          {conv.participants.map((p) => {
            const pModel = getModelById(p.modelId);
            const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
            const displayName = pModel?.displayName ?? p.modelId;
            const displayNameWithRole = pIdentity?.name ? `${displayName}（${pIdentity.name}）` : displayName;
            const { initials } = getAvatarProps(displayName);
            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="h-8 w-8 flex items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>
                  <span className="text-xs font-bold text-primary">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground truncate">{displayNameWithRole}</p>
                  <p className="text-[12px] text-muted-foreground truncate">{pIdentity ? pIdentity.name : t("chat.noIdentity")}</p>
                </div>
                <button
                  className="p-1.5 active:opacity-60"
                  onClick={() => { setEditingParticipantId(p.id); setShowParticipants(false); setShowIdentityPanel(true); }}
                >
                  <IoPersonOutline size={16} color="var(--primary)" />
                </button>
                <button
                  className="p-1.5 active:opacity-60"
                  onClick={() => { if (confirm(t("chat.removeMember") + ": " + displayName)) removeParticipant(conversationId, p.id); }}
                >
                  <IoTrashOutline size={16} color="var(--destructive)" />
                </button>
              </div>
            );
          })}
          <button
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mt-1 mb-1 border border-dashed active:opacity-60"
            style={{ borderColor: "var(--border)" }}
            onClick={() => { setModelPickerMode("add"); setShowModelPicker(true); }}
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
      />

      {/* Messages + Input */}
      <div className="flex-1 min-h-0 relative">
        <ChatView
          conversationId={conversationId}
          isMobile
          onScrollRef={scrollRef}
          onScroll={handleScroll}
          modelName={!isGroup ? model?.displayName : undefined}
          onSwitchModel={!isGroup ? () => { setModelPickerMode("switch"); setShowModelPicker(true); } : undefined}
        />
        {showScrollToBottom && (
          <button
            className="absolute bottom-20 right-4 z-10 flex items-center justify-center rounded-full p-2.5 shadow-md active:opacity-70"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary) 90%, transparent)" }}
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              setShowScrollToBottom(false);
            }}
          >
            <IoArrowDown size={16} color="white" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Chats List (1:1 RN original) ──

type FilterType = "all" | "single" | "group";

function MobileConversationList({ onNavigateToExperts }: { onNavigateToExperts: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversations = useConversations();
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const enabledModels = models.filter((m) => m.enabled);
  const hasProviders = providers.some((p) => (p.status as string) === "active" || p.status === "connected");

  const filtered = useMemo(() => conversations.filter((c: Conversation) => {
    if (filter === "single" && c.type !== "single") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [conversations, filter, searchQuery]);

  const handleNew = useCallback(async () => {
    if (enabledModels.length === 0) {
      const conv = await createConversation("");
      navigate(`/chat/${conv.id}`);
      return;
    }
    if (enabledModels.length === 1) {
      const conv = await createConversation(enabledModels[0].id);
      navigate(`/chat/${conv.id}`);
      return;
    }
    setShowModelPicker(true);
  }, [enabledModels, createConversation, navigate]);

  const handleModelSelect = useCallback(async (modelId: string) => {
    const conv = await createConversation(modelId);
    navigate(`/chat/${conv.id}`);
  }, [createConversation, navigate]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[28px] font-bold text-foreground tracking-tight">{t("tabs.chats")}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoSearchOutline size={22} color="var(--primary)" />
            </button>
            <button
              onClick={handleNew}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoCreateOutline size={22} color="var(--primary)" />
            </button>
          </div>
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

      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelSelect}
      />

      {/* List */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {filtered.length === 0 ? (
          <OnboardingOrEmpty hasProviders={hasProviders} onNew={onNavigateToExperts} />
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              onSelect={() => navigate(`/chat/${conv.id}`)}
              onDelete={() => {
                if (confirm(t("common.areYouSure"))) deleteConversation(conv.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Onboarding / Empty State (1:1 RN original) ──

function OnboardingOrEmpty({ hasProviders, onNew }: { hasProviders: boolean; onNew: () => void }) {
  const { t } = useTranslation();
  if (!hasProviders) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="mb-6 h-20 w-20 flex items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
          <IoSparkles size={40} color="var(--primary)" />
        </div>
        <p className="text-center text-xl font-bold text-foreground">{t("settings.appName")}</p>
        <p className="mt-3 text-center text-sm leading-5 text-muted-foreground">
          {t("models.configureHint")}
        </p>
        <button
          onClick={() => {/* navigate to settings - handled by tab */}}
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
      <IoChatbubbleOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
      <p className="mt-4 text-center text-lg font-semibold text-foreground">{t("chats.noConversations")}</p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {t("chats.goToModels")}
      </p>
      <button
        onClick={onNew}
        className="mt-5 rounded-xl px-6 py-2.5 active:opacity-80 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--primary)" }}
      >
        {t("chats.startConversation")}
      </button>
    </div>
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

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-3 text-left active:opacity-80 transition-colors"
      style={{ borderBottom: "0.5px solid var(--border)" }}
    >
      {/* Avatar with status dot (1:1 RN) */}
      <div className="relative flex-shrink-0">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-semibold"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        {firstModel && (
          <div
            className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2"
            style={{
              borderColor: "var(--background)",
              backgroundColor: isConnected ? "#34C759" : "var(--border)",
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
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

