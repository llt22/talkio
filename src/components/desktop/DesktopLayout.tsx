import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MessageSquare, Bot, Compass, Settings, Plus, MoreHorizontal, Trash2, Eraser, UserPlus, Share2, ChevronDown, ChevronUp, User, Users, Pencil, Search, ArrowDown, ArrowUpDown, Shuffle, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { ChatView } from "../shared/ChatView";
import { ModelPicker } from "../shared/ModelPicker";
import { AddMemberPicker, type SelectedMember } from "../shared/AddMemberPicker";
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
import type { Conversation, ConversationParticipant, Identity } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { exportConversationAsMarkdown } from "../../services/export";
import { useConfirm } from "../shared/ConfirmDialogProvider";

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
            onScrollRef={scrollRef}
            onScroll={() => {
              const el = scrollRef.current;
              if (!el) return;
              setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
            }}
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
            onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setShowScrollBottom(false); }}
          >
            <ArrowDown size={14} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>
      </div>
    </div>
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
