import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MessageSquare, Bot, Compass, Settings, Plus, MoreHorizontal, Trash2, Eraser, UserPlus, Share2, ChevronDown, ChevronUp, User, Users, Pencil, Search, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChatView } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { SettingsPage } from "../../pages/settings/SettingsPage";
import { DiscoverPage } from "../../pages/DiscoverPage";
import { ModelsPage } from "../../pages/settings/ModelsPage";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useConversations } from "../../hooks/useDatabase";
import { useProviderStore } from "../../stores/provider-store";
import { useChatPanelState } from "../../hooks/useChatPanelState";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import type { Conversation, Identity } from "../../../../src/types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { exportConversationAsMarkdown } from "../../services/export";
import { useConfirm } from "../shared/ConfirmDialogProvider";

type DesktopSection = "chats" | "experts" | "discover" | "settings";

const MIN_SIDEBAR = 200;
const MAX_SIDEBAR = 480;
const DEFAULT_SIDEBAR = 288;

export function DesktopLayout() {
  const [activeSection, setActiveSection] = useState<DesktopSection>("chats");
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("desktop-sidebar-width");
    return saved ? Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, Number(saved))) : DEFAULT_SIDEBAR;
  });
  const isResizing = useRef(false);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "n") {
        e.preventDefault();
        setActiveSection("chats");
        // Trigger new chat via DOM click on the + button
        document.querySelector<HTMLButtonElement>("[data-new-chat]")?.click();
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setActiveSection("settings");
      }
      if (meta && e.key === ",") {
        e.preventDefault();
        setActiveSection("settings");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => { sidebarWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;

    function onMouseMove(ev: MouseEvent) {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX;
      const newWidth = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, startWidth + delta));
      setSidebarWidth(newWidth);
    }
    function onMouseUp() {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("desktop-sidebar-width", String(sidebarWidthRef.current));
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  return (
    <div className="flex h-full">
      {/* Icon Navigation Bar (WeChat-style) */}
      <div className="flex-shrink-0 w-14 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 gap-1">
        {([
          { id: "chats" as DesktopSection, icon: MessageSquare, label: "Chats" },
          { id: "experts" as DesktopSection, icon: Bot, label: "Models" },
          { id: "discover" as DesktopSection, icon: Compass, label: "Discover" },
        ]).map(({ id, icon: Icon, label }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveSection(id)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                  activeSection === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveSection("settings")}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                activeSection === "settings"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Settings size={20} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>

      {/* Middle Panel — only shown for chats section */}
      {activeSection === "chats" && (
        <div className="flex-shrink-0 bg-sidebar border-r border-sidebar-border overflow-y-auto relative" style={{ width: sidebarWidth }}>
          <DesktopConversationList />

          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
            onMouseDown={handleResizeStart}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 bg-background">
        {activeSection === "settings" ? (
          <SettingsPage />
        ) : activeSection === "discover" ? (
          <DiscoverPage />
        ) : activeSection === "experts" ? (
          <ModelsPage onNavigateToChat={(convId) => { setCurrentConversation(convId); setActiveSection("chats"); }} />
        ) : activeSection === "chats" && currentConversationId ? (
          <DesktopChatPanel conversationId={currentConversationId} />
        ) : (
          <DesktopEmptyState section={activeSection} />
        )}
      </div>
    </div>
  );
}

function DesktopConversationList() {
  const { t } = useTranslation();
  const conversations = useConversations();
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const clearConversationMessages = useChatStore((s) => s.clearConversationMessages);
  const models = useProviderStore((s) => s.models);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const enabledModels = models.filter((m) => m.enabled);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(q) || (c.lastMessage ?? "").toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const handleNew = useCallback(async () => {
    if (enabledModels.length === 0) {
      const conv = await createConversation("");
      setCurrentConversation(conv.id);
      return;
    }
    if (enabledModels.length === 1) {
      const conv = await createConversation(enabledModels[0].id);
      setCurrentConversation(conv.id);
      return;
    }
    setShowModelPicker(true);
  }, [enabledModels, createConversation, setCurrentConversation]);

  const handleModelSelect = useCallback(async (modelId: string) => {
    const conv = await createConversation(modelId);
    setCurrentConversation(conv.id);
  }, [createConversation, setCurrentConversation]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Conversations</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" data-new-chat onClick={handleNew}>
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      </div>

      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelSelect}
      />

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: "var(--muted)" }}>
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("chats.searchChats")}
            className="flex-1 text-[13px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredConversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">{searchQuery ? t("chats.noResults") : t("chats.noConversations")}</p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <DesktopConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              onSelect={() => setCurrentConversation(conv.id)}
              onDelete={() => deleteConversation(conv.id)}
              onClear={() => clearConversationMessages(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DesktopConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onClear,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
          }`}
          onClick={onSelect}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare size={14} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate">
              {conversation.title}
            </p>
            {conversation.lastMessage && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {conversation.lastMessage}
              </p>
            )}
          </div>

          {/* Three-dot menu (hover) */}
          <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-opacity ${
                  showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                } hover:bg-sidebar-accent`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={14} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                className="text-xs"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
              >
                <Eraser size={14} className="mr-2" />
                Clear Messages
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive text-xs"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem className="text-xs" onClick={onClear}>
          <Eraser size={14} className="mr-2" />
          Clear Messages
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive focus:text-destructive text-xs" onClick={onDelete}>
          <Trash2 size={14} className="mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DesktopChatPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const scrollRef = useRef<HTMLDivElement>(null);
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
  } = useChatPanelState(conversationId);
  const title = isGroup ? conv?.title ?? "Group" : model?.displayName ?? "Chat";
  const subtitle = isGroup
    ? `${conv?.participants.length ?? 0} models`
    : activeIdentity?.name ?? "Select Role";

  const handleExport = useCallback(async () => {
    if (!conv || isExporting || messages.length === 0) return;
    setIsExporting(true);
    try {
      exportConversationAsMarkdown({
        conversation: conv,
        messages,
        titleFallback: "Chat",
        youLabel: "You",
        thoughtProcessLabel: "Thought process",
      });
    } finally {
      setIsExporting(false);
    }
  }, [conv, messages, isExporting]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background">
        <div className="flex-1 min-w-0">
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
        </div>

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
          {conv.participants.map((p) => {
            const pModel = getModelById(p.modelId);
            const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
            const displayName = pModel?.displayName ?? p.modelId;
            const { initials } = getAvatarProps(displayName);
            return (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-primary">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{pIdentity ? pIdentity.name : "No role"}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParticipant(conversationId, p.id)}>
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </div>
            );
          })}
          <button
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 mt-1 text-xs text-primary hover:opacity-70"
            onClick={() => { setModelPickerMode("add"); setShowModelPicker(true); }}
          >
            <Plus size={14} /> Add Member
          </button>
        </div>
      )}

      {/* Identity panel (single chat) */}
      {!isGroup && showIdentityPanel && (
        <div className="flex-shrink-0 border-b border-border bg-card" style={{ maxHeight: 240, overflowY: "auto" }}>
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left"
            onClick={() => { updateParticipantIdentity(conversationId, currentParticipant?.id ?? "", null); setShowIdentityPanel(false); }}
          >
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-muted-foreground" />
            </div>
            <span className="text-[13px] text-foreground flex-1">No role</span>
            {!currentParticipant?.identityId && <span className="text-xs text-primary font-semibold">✓</span>}
          </button>
          {identities.map((identity: Identity) => (
            <button
              key={identity.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left border-t border-border/50"
              onClick={() => { updateParticipantIdentity(conversationId, currentParticipant?.id ?? "", identity.id); setShowIdentityPanel(false); }}
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-primary">{identity.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{identity.name}</p>
                {identity.systemPrompt && <p className="text-[11px] text-muted-foreground truncate">{identity.systemPrompt.slice(0, 60)}</p>}
              </div>
              {currentParticipant?.identityId === identity.id && <span className="text-xs text-primary font-semibold">✓</span>}
            </button>
          ))}
        </div>
      )}

      <ModelPicker open={showModelPicker} onClose={() => setShowModelPicker(false)} onSelect={handleModelPickerSelect} />

      {/* Chat */}
      <div className="flex-1 min-h-0 relative">
        <ChatView
          conversationId={conversationId}
          modelName={!isGroup ? model?.displayName : undefined}
          onSwitchModel={!isGroup ? () => { setModelPickerMode("switch"); setShowModelPicker(true); } : undefined}
          isGroup={isGroup}
          participants={conv?.participants ?? []}
          onScrollRef={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
          }}
        />
        {showScrollBottom && (
          <button
            onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }}
            className="absolute bottom-20 right-4 h-9 w-9 flex items-center justify-center rounded-full shadow-md z-10 active:opacity-70"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <ArrowDown size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopEmptyState({ section }: { section: DesktopSection }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <MessageSquare size={48} strokeWidth={1} className="mb-4 text-muted-foreground/20" />
      <p className="text-lg font-medium">Talkio 2.0</p>
      <p className="text-sm mt-1 text-muted-foreground/60">
        Select a conversation or start a new one
      </p>
    </div>
  );
}
