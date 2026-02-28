import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { MessageSquare, Bot, Compass, Settings, Plus, Trash2, Eraser, Search, MoreHorizontal, Users, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModelPicker } from "../shared/ModelPicker";
import { AddMemberPicker, type SelectedMember } from "../shared/AddMemberPicker";
import { SettingsPage } from "../../pages/settings/SettingsPage";
import { DiscoverPage } from "../../pages/DiscoverPage";
import { ModelsPage } from "../../pages/settings/ModelsPage";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useConversations } from "../../hooks/useDatabase";
import { useProviderStore } from "../../stores/provider-store";
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
import type { Conversation, ConversationParticipant } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import { DesktopChatPanel } from "./DesktopChatPanel";

type DesktopSection = "chats" | "experts" | "discover" | "settings";

const MIN_SIDEBAR = 200;
const MAX_SIDEBAR = 480;
const DEFAULT_SIDEBAR = 288;

export function DesktopLayout() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<DesktopSection>("chats");
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const createConversation = useChatStore((s: ChatState) => s.createConversation);
  const [showCreateGroupPicker, setShowCreateGroupPicker] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("desktop-sidebar-width");
    return saved ? Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, Number(saved))) : DEFAULT_SIDEBAR;
  });
  const isResizing = useRef(false);

  // Keyboard shortcuts
  useHotkeys("mod+n", () => {
    setActiveSection("chats");
    document.querySelector<HTMLButtonElement>("[data-new-chat]")?.click();
  }, { preventDefault: true });
  useHotkeys("mod+shift+s", () => setActiveSection("settings"), { preventDefault: true });
  useHotkeys("mod+,", () => setActiveSection("settings"), { preventDefault: true });

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
          { id: "chats" as DesktopSection, icon: MessageSquare, label: t("tabs.chats") },
          { id: "experts" as DesktopSection, icon: Bot, label: t("tabs.models") },
          { id: "discover" as DesktopSection, icon: Compass, label: t("tabs.personas") },
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
          <TooltipContent side="right">{t("tabs.settings")}</TooltipContent>
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
          <ModelsPage
            onNavigateToChat={(convId) => { setCurrentConversation(convId); setActiveSection("chats"); }}
            onCreateGroup={() => setShowCreateGroupPicker(true)}
          />
        ) : activeSection === "chats" && currentConversationId ? (
          <DesktopChatPanel conversationId={currentConversationId} />
        ) : (
          <DesktopEmptyState section={activeSection} />
        )}
      </div>

      <AddMemberPicker
        open={showCreateGroupPicker}
        onClose={() => setShowCreateGroupPicker(false)}
        minMembers={2}
        onConfirm={async (members: SelectedMember[]) => {
          const conv = await createConversation(members[0].modelId, undefined, members);
          setCurrentConversation(conv.id);
          setActiveSection("chats");
        }}
      />
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
  const renameConversation = useChatStore((s) => s.renameConversation);
  const models = useProviderStore((s) => s.models);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [animateRef] = useAutoAnimate();

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
        <h2 className="text-sm font-semibold text-sidebar-foreground">{t("tabs.chats")}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" data-new-chat onClick={handleNew}>
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("chats.startConversation")}</TooltipContent>
        </Tooltip>
      </div>

      <ModelPicker
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={handleModelSelect}
      />

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ backgroundColor: "var(--secondary)" }}>
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
      <div ref={animateRef} className="flex-1 overflow-y-auto py-1">
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
              onRename={(title) => renameConversation(conv.id, title)}
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
  onRename,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onClear: () => void;
  onRename: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
          }`}
          onClick={onSelect}
        >
          {conversation.type === "group" ? (
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary/15">
              <Users size={15} className="text-primary" />
            </div>
          ) : (
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
              style={{ backgroundColor: getAvatarProps(conversation.title).color }}
            >
              {getAvatarProps(conversation.title).initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { onRename(renameValue); setIsRenaming(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { onRename(renameValue); setIsRenaming(false); } if (e.key === "Escape") setIsRenaming(false); }}
                onClick={(e) => e.stopPropagation()}
                className="text-[13px] font-medium text-sidebar-foreground bg-transparent border-b border-primary outline-none w-full"
              />
            ) : (
              <p className="text-[13px] font-medium text-sidebar-foreground truncate">
                {conversation.title}
              </p>
            )}
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
                {t("chat.clearHistory")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive text-xs"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 size={14} className="mr-2" />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem className="text-xs" onClick={() => { setRenameValue(conversation.title); setIsRenaming(true); }}>
          <Pencil size={14} className="mr-2" />
          {t("chat.rename")}
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={onClear}>
          <Eraser size={14} className="mr-2" />
          {t("chat.clearHistory")}
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive focus:text-destructive text-xs" onClick={onDelete}>
          <Trash2 size={14} className="mr-2" />
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DesktopEmptyState({ section }: { section: DesktopSection }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <img src="/logo.png" alt="Talkio" className="h-32 w-32 mb-4 object-contain" />
      <p className="text-lg font-medium">Talkio</p>
      <p className="text-sm mt-1 text-muted-foreground/60">
        {t("chats.startConversation")}
      </p>
    </div>
  );
}
