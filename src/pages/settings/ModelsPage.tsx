import { useState, useMemo, useCallback } from "react";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  isMobile?: boolean;
}

export function ModelsPage({
  onNavigateToChat,
  onCreateGroup,
  isMobile = false,
}: ModelsPageProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobileNav = useMobileNav();
  const models = useProviderStore((s) => s.models);
  const enabledModels = useMemo(() => models.filter((m: Model) => m.enabled), [models]);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const createConversation = useChatStore((s) => s.createConversation);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const goToChat = useCallback(
    (convId: string) => {
      if (onNavigateToChat) onNavigateToChat(convId);
      else if (mobileNav) mobileNav.pushChat(convId);
      else navigate(`/chat/${convId}`);
    },
    [onNavigateToChat, mobileNav, navigate],
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
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 24 }}>
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
              <div
                className="sticky top-0 z-10 px-5 py-1.5"
                style={{ backgroundColor: "var(--secondary)" }}
              >
                <p className="text-muted-foreground text-[13px] font-semibold">{section.title}</p>
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
                      <p className="text-muted-foreground truncate text-[13px]">{model.modelId}</p>
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
    </div>
  );
}
