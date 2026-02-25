import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoCloseCircle, IoPeopleOutline, IoChevronForward, IoCheckmarkCircle, IoChatbubbles } from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import { useChatStore } from "../../stores/chat-store";
import type { Model } from "../../../../src/types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";

// ── Models / Experts Page (1:1 RN original) ──

function groupByProvider(
  models: Model[],
  getProviderById: (id: string) => { name: string } | undefined,
): Array<{ title: string; data: Model[] }> {
  const map = new Map<string, { title: string; data: Model[] }>();
  for (const m of models) {
    const provider = getProviderById(m.providerId);
    const name = provider?.name ?? "Unknown";
    if (!map.has(name)) map.set(name, { title: name, data: [] });
    map.get(name)!.data.push(m);
  }
  for (const section of map.values()) {
    section.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

interface ModelsPageProps {
  onNavigateToChat?: (convId: string) => void;
  isMobile?: boolean;
}

export function ModelsPage({ onNavigateToChat, isMobile = false }: ModelsPageProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const models = useProviderStore((s) => s.models);
  const enabledModels = useMemo(() => models.filter((m: Model) => m.enabled), [models]);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState(false);

  const goToChat = useCallback((convId: string) => {
    if (onNavigateToChat) onNavigateToChat(convId);
    else navigate(`/chat/${convId}`);
  }, [onNavigateToChat, navigate]);

  const filtered = useMemo(() => enabledModels.filter((m: Model) =>
    searchQuery
      ? m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.modelId.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  ), [enabledModels, searchQuery]);

  const sections = useMemo(() => groupByProvider(filtered, getProviderById), [filtered, getProviderById]);

  const handleStartChat = useCallback(async (model: Model) => {
    if (groupMode) {
      setSelectedForGroup((prev) =>
        prev.includes(model.id)
          ? prev.filter((id) => id !== model.id)
          : [...prev, model.id],
      );
      return;
    }
    const conv = await createConversation(model.id);
    goToChat(conv.id);
  }, [groupMode, createConversation, goToChat]);

  const handleCreateGroup = useCallback(async () => {
    if (selectedForGroup.length < 2) return;
    const [first, ...rest] = selectedForGroup;
    const conv = await createConversation(first, rest);
    setGroupMode(false);
    setSelectedForGroup([]);
    goToChat(conv.id);
  }, [selectedForGroup, createConversation, goToChat]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("models.title")}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoSearchOutline size={22} color="var(--primary)" />
            </button>
            {sections.length > 0 && (
              <button
                onClick={() => { setGroupMode((v) => !v); setSelectedForGroup([]); }}
                className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
              >
                <IoChatbubbles size={20} color={groupMode ? "var(--destructive)" : "var(--primary)"} />
              </button>
            )}
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
              placeholder={t("providerEdit.searchModels")}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: groupMode && selectedForGroup.length >= 2 ? 80 : 24 }}>
        {sections.length === 0 ? (
          <EmptyState
            icon={<IoPeopleOutline size={28} color="var(--muted-foreground)" />}
            title={t("models.noModels")}
            subtitle={t("models.configureHint")}
          />
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              {/* Section Header */}
              <div className="px-5 py-1.5 sticky top-0 z-10" style={{ backgroundColor: "var(--secondary)" }}>
                <p className="text-[13px] font-semibold text-muted-foreground">{section.title}</p>
              </div>
              {/* Items */}
              {section.data.map((model, idx) => {
                const isSelected = selectedForGroup.includes(model.id);
                const { color: mColor, initials: mInitials } = getAvatarProps(model.displayName);
                return (
                  <button
                    key={model.id}
                    onClick={() => handleStartChat(model)}
                    className={`w-full flex items-center gap-4 px-4 py-3 active:opacity-70 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                    style={{
                      backgroundColor: isSelected ? "color-mix(in srgb, var(--primary) 8%, var(--background))" : "var(--background)",
                      borderBottom: idx < section.data.length - 1 ? "0.5px solid var(--border)" : "none",
                    }}
                  >
                    {/* Avatar (1:1 RN — rounded-full, 2-char initials) */}
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                      style={{ backgroundColor: mColor }}
                    >
                      {mInitials}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[16px] font-medium text-foreground truncate">{model.displayName}</p>
                      <p className="text-[13px] text-muted-foreground truncate">{model.modelId}</p>
                    </div>
                    {groupMode ? (
                      isSelected
                        ? <IoCheckmarkCircle size={22} color="var(--primary)" />
                        : <svg width="22" height="22" viewBox="0 0 512 512" fill="none" stroke="var(--muted-foreground)" strokeWidth="32"><circle cx="256" cy="256" r="192" /></svg>
                    ) : (
                      <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Group Mode Bottom Bar */}
      {groupMode && selectedForGroup.length >= 2 && (
        <div className="absolute left-5 right-5" style={{ bottom: isMobile ? "4rem" : "1rem" }}>
          <button
            onClick={handleCreateGroup}
            className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-70"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {t("models.createGroup", { count: selectedForGroup.length })}
          </button>
        </div>
      )}
    </div>
  );
}
