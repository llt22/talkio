import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { useTranslation } from "react-i18next";
import {
  IoSearchOutline,
  IoCloseCircle,
  IoPeopleOutline,
  IoChevronForward,
  IoChatbubbles,
} from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import { useChatStore } from "../../stores/chat-store";
import type { Model } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { groupModelsByProvider } from "../../lib/model-utils";
import { EmptyState } from "../../components/shared/EmptyState";

// ── Models / Experts Page (1:1 RN original) ──

interface ModelsPageProps {
  onNavigateToChat?: (convId: string) => void;
  onCreateGroup?: () => void;
  /** Desktop: open a provider's edit page. Mobile falls back to MobileNav. */
  onEditProvider?: (providerId: string) => void;
  isMobile?: boolean;
}

export function ModelsPage({
  onNavigateToChat,
  onCreateGroup,
  onEditProvider,
  isMobile = false,
}: ModelsPageProps = {}) {
  const { t } = useTranslation();
  const mobileNav = useMobileNav();
  const models = useProviderStore((s) => s.models);
  const providers = useProviderStore((s) => s.providers);
  const getEnabledModels = useProviderStore((s) => s.getEnabledModels);
  const enabledModels = useMemo(() => getEnabledModels(), [models, providers]);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const goToChat = useCallback(
    (convId: string) => {
      if (onNavigateToChat) onNavigateToChat(convId);
      else mobileNav?.pushChat(convId);
    },
    [onNavigateToChat, mobileNav],
  );

  const filtered = useMemo(
    () =>
      enabledModels.filter((m: Model) =>
        searchQuery
          ? m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.modelId.toLowerCase().includes(searchQuery.toLowerCase())
          : true,
      ),
    [enabledModels, searchQuery],
  );

  const sections = useMemo(
    () => groupModelsByProvider(filtered, getProviderById),
    [filtered, getProviderById],
  );

  // Build deduplicated initial → first section title mapping
  const indexEntries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of sections) {
      const ch = s.title.charAt(0).toUpperCase();
      if (!seen.has(ch)) seen.set(ch, s.title);
    }
    return Array.from(seen.entries()); // [[initial, sectionTitle], ...]
  }, [sections]);

  const handleIndexClick = useCallback((sectionTitle: string) => {
    const el = document.getElementById(`section-${sectionTitle}`);
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const offset = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: offset, behavior: "smooth" });
    }
  }, []);

  // Track which section is currently visible
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || sections.length === 0) return;
    const onScroll = () => {
      let current = sections[0]?.title ?? null;
      for (const section of sections) {
        const el = document.getElementById(`section-${section.title}`);
        if (el) {
          const top = el.offsetTop - container.offsetTop - container.scrollTop;
          if (top <= 40) current = section.title;
        }
      }
      setActiveSection(current);
    };
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [sections]);

  const handleStartChat = useCallback(
    async (model: Model) => {
      const conv = await createConversation(model.id);
      goToChat(conv.id);
    },
    [createConversation, goToChat],
  );

  const handleGroupClick = useCallback(() => {
    if (onCreateGroup) {
      onCreateGroup();
    } else if (mobileNav) {
      mobileNav.pushAddMember();
    }
  }, [onCreateGroup, mobileNav]);

  // Jump to the provider's edit page to add/remove/toggle its models.
  const handleManageProvider = useCallback(
    (providerId: string) => {
      if (onEditProvider) onEditProvider(providerId);
      else mobileNav?.pushSettingsProviderEdit(providerId);
    },
    [onEditProvider, mobileNav],
  );

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-foreground text-[20px] font-bold tracking-tight">
            {t("models.title")}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IoSearchOutline size={22} color="var(--primary)" />
            </button>
            {sections.length > 0 && (
              <button
                onClick={handleGroupClick}
                className="flex h-9 w-9 items-center justify-center rounded-full active:opacity-60"
              >
                <IoChatbubbles size={20} color="var(--primary)" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 pb-2">
          <div
            className="flex items-center rounded-xl px-3 py-2"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <IoSearchOutline size={18} color="var(--muted-foreground)" />
            <input
              className="text-foreground ml-2 flex-1 bg-transparent text-[15px] outline-none"
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
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto" style={{ paddingBottom: 24 }}>
          {sections.length === 0 ? (
            <EmptyState
              icon={<IoPeopleOutline size={28} color="var(--muted-foreground)" />}
              title={t("models.noModels")}
              subtitle={t("models.configureHint")}
            />
          ) : (
            sections.map((section) => (
              <div key={section.title} id={`section-${section.title}`}>
                {/* Section Header */}
                <div
                  className="sticky top-0 z-10 flex items-center justify-between px-5 py-1.5"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <p className="text-muted-foreground text-[13px] font-semibold">{section.title}</p>
                  {section.data[0]?.providerId && (
                    <button
                      onClick={() => handleManageProvider(section.data[0].providerId)}
                      className="text-primary text-[12px] font-medium active:opacity-60"
                    >
                      {t("models.manage")}
                    </button>
                  )}
                </div>
                {/* Items */}
                {section.data.map((model, idx) => {
                  const { color: mColor, initials: mInitials } = getAvatarProps(model.displayName);
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleStartChat(model)}
                      className="flex w-full items-center gap-4 px-4 py-3 transition-colors active:opacity-70"
                      style={{
                        backgroundColor: "var(--background)",
                        borderBottom:
                          idx < section.data.length - 1 ? "0.5px solid var(--border)" : "none",
                      }}
                    >
                      {/* Avatar (1:1 RN — rounded-full, 2-char initials) */}
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: mColor }}
                      >
                        {mInitials}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-foreground truncate text-[16px] font-medium">
                          {model.displayName}
                        </p>
                        <p className="text-muted-foreground truncate text-[13px]">
                          {model.modelId}
                        </p>
                      </div>
                      <IoChevronForward
                        size={18}
                        color="var(--muted-foreground)"
                        style={{ opacity: 0.3 }}
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Initial Index Sidebar — floating overlay */}
        {indexEntries.length > 1 && (
          <div
            className="absolute top-1/2 right-0.5 z-20 flex -translate-y-1/2 flex-col items-center rounded-full px-[3px] py-1"
            style={{ backgroundColor: "color-mix(in srgb, var(--card) 80%, transparent)" }}
          >
            {indexEntries.map(([initial, sectionTitle]) => {
              const isActive = activeSection === sectionTitle;
              return (
                <button
                  key={initial}
                  onClick={() => handleIndexClick(sectionTitle)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] leading-none font-bold transition-colors active:opacity-60"
                  style={{
                    color: isActive ? "var(--primary)" : "var(--muted-foreground)",
                    backgroundColor: isActive
                      ? "color-mix(in srgb, var(--primary) 15%, transparent)"
                      : "transparent",
                  }}
                  title={sectionTitle}
                >
                  {initial}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
