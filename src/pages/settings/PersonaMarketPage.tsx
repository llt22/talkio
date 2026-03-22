import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  IoChevronBack,
  IoRefreshOutline,
  IoCheckmarkCircle,
  IoAddCircleOutline,
} from "../../icons";
import {
  fetchPersonaMarket,
  invalidatePersonaMarketCache,
  type MarketPersona,
} from "../../services/persona-market";
import { useIdentityStore } from "../../stores/identity-store";
import { getAvatarProps } from "../../lib/avatar-utils";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";

// ── Category filter ──

const CATEGORIES = [
  { key: "all", zhLabel: "全部", enLabel: "All" },
  { key: "productivity", zhLabel: "效率", enLabel: "Productivity" },
  { key: "technical", zhLabel: "技术", enLabel: "Technical" },
  { key: "learning", zhLabel: "学习", enLabel: "Learning" },
  { key: "creative", zhLabel: "创意", enLabel: "Creative" },
  { key: "fun", zhLabel: "趣味", enLabel: "Fun" },
];

// ── Persona Card ──

function PersonaCard({
  persona,
  imported,
  onImport,
  isZh,
}: {
  persona: MarketPersona;
  imported: boolean;
  onImport: () => void;
  isZh: boolean;
}) {
  const { color, initials } = getAvatarProps(persona.name);

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl p-4"
      style={{ backgroundColor: "var(--secondary)" }}
    >
      {/* Avatar + name + category */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-[15px] font-semibold">{persona.name}</p>
          <p className="text-muted-foreground text-[12px]">{persona.description}</p>
        </div>
      </div>

      {/* System prompt preview */}
      <p className="text-muted-foreground line-clamp-2 text-[13px] leading-relaxed">
        {persona.systemPrompt}
      </p>

      {/* Import button */}
      <button
        onClick={onImport}
        disabled={imported}
        className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition-opacity active:opacity-60 disabled:opacity-50"
        style={{
          backgroundColor: imported
            ? "color-mix(in srgb, var(--primary) 8%, transparent)"
            : "color-mix(in srgb, var(--primary) 10%, transparent)",
          color: "var(--primary)",
        }}
      >
        {imported ? (
          <>
            <IoCheckmarkCircle size={16} />
            <span>{isZh ? "已导入" : "Imported"}</span>
          </>
        ) : (
          <>
            <IoAddCircleOutline size={16} />
            <span>{isZh ? "导入" : "Import"}</span>
          </>
        )}
      </button>
    </div>
  );
}

// ── Main Page ──

export function PersonaMarketPage({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation();
  const isZh = i18n.language === "zh" || i18n.language.startsWith("zh");

  const addIdentity = useIdentityStore((s) => s.addIdentity);
  const identities = useIdentityStore((s) => s.identities);

  const [personas, setPersonas] = useState<MarketPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());

  // Pre-populate from already-existing identities
  useEffect(() => {
    const alreadyIn = new Set(identities.map((i) => i.name));
    setImportedNames(alreadyIn);
  }, [identities]);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRefresh) invalidatePersonaMarketCache();
      const data = await fetchPersonaMarket();
      setPersonas(data.personas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = useCallback(
    (persona: MarketPersona) => {
      addIdentity({
        name: persona.name,
        icon: persona.icon,
        systemPrompt: persona.systemPrompt,
        params: { temperature: persona.params?.temperature ?? 0.7 },
        mcpToolIds: [],
        mcpServerIds: [],
      });
      setImportedNames((prev) => new Set(prev).add(persona.name));
      appAlert(isZh ? `「${persona.name}」已导入到角色列表` : `"${persona.name}" imported`);
    },
    [addIdentity, isZh],
  );

  const filtered =
    activeCategory === "all"
      ? personas
      : personas.filter((p) => p.category === activeCategory);

  const title = isZh ? "角色市场" : "Persona Market";
  const refreshLabel = isZh ? "刷新" : "Refresh";
  const errorLabel = isZh ? "加载失败，点击重试" : "Failed to load. Tap to retry.";
  const emptyLabel = isZh ? "暂无角色" : "No personas";

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 px-4 pt-2 pb-2">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full active:opacity-60"
        >
          <IoChevronBack size={22} color="var(--primary)" />
        </button>
        <h1 className="text-foreground flex-1 text-[20px] font-bold tracking-tight">{title}</h1>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
          title={refreshLabel}
        >
          <IoRefreshOutline size={20} color="var(--primary)" />
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex-shrink-0 overflow-x-auto px-4 pb-3">
        <div className="flex gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors active:opacity-70"
              style={{
                backgroundColor:
                  activeCategory === cat.key
                    ? "var(--primary)"
                    : "var(--secondary)",
                color: activeCategory === cat.key ? "white" : "var(--foreground)",
              }}
            >
              {isZh ? cat.zhLabel : cat.enLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }}
            />
          </div>
        ) : error ? (
          <button
            onClick={() => load(true)}
            className="mt-8 flex w-full flex-col items-center gap-2 py-4 active:opacity-60"
          >
            <p className="text-muted-foreground text-[14px]">{errorLabel}</p>
          </button>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-muted-foreground text-[14px]">{emptyLabel}</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {filtered.map((persona) => (
                <PersonaCard
                  key={persona.name}
                  persona={persona}
                  imported={importedNames.has(persona.name)}
                  onImport={() => handleImport(persona)}
                  isZh={isZh}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
