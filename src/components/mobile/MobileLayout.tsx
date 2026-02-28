import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { IoChatbubbles, IoCube, IoPersonCircle, IoSettings, IoSearchOutline, IoCloseCircle, IoSparkles, IoChatbubbleOutline, IoAddCircleOutline, IoTrashOutline, IoPeopleOutline } from "../../icons";
import { ModelPicker } from "../shared/ModelPicker";
import { MobileStack } from "./MobileStack";
import { SettingsMainContent } from "./SettingsMainContent";
import { DiscoverPage } from "../../pages/DiscoverPage";
import { ModelsPage } from "../../pages/settings/ModelsPage";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useConversations } from "../../hooks/useDatabase";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";
import type { Conversation } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import i18n from "../../i18n";

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

// Re-export MobileChatDetail from its own file
export { MobileChatDetail } from "./MobileChatDetail";

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

