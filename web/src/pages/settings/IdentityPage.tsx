import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { IoPersonOutline, IoAddCircleOutline, IoTrashOutline, IoChevronForward, IoChevronBack, IoSearchOutline, IoCloseCircle, IoAdd } from "../../icons";
import { useIdentityStore } from "../../stores/identity-store";
import type { Identity } from "../../../../src/types";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";

type IdentityStoreState = ReturnType<typeof useIdentityStore.getState>;

// ── Identity / Persona Page ──

export function IdentityPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const identities = useIdentityStore((s: IdentityStoreState) => s.identities);
  const deleteIdentity = useIdentityStore((s: IdentityStoreState) => s.deleteIdentity);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() =>
    searchQuery
      ? identities.filter((i: Identity) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : identities,
  [identities, searchQuery]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* Header: title + search + add */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[28px] font-bold text-foreground tracking-tight">{t("personas.title")}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoSearchOutline size={22} color="var(--primary)" />
            </button>
            <button
              onClick={() => navigate("/identity/new")}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoAdd size={24} color="var(--primary)" />
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
              placeholder={t("personas.searchIdentities")}
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

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 px-5">
            <IoPersonOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
            <p className="mt-4 text-lg font-semibold text-foreground">{t("personas.noCustomTools")}</p>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              {t("models.configureHint")}
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {filtered.map((identity: Identity, idx: number) => (
              <IdentityItem
                key={identity.id}
                identity={identity}
                isLast={idx === filtered.length - 1}
                onEdit={() => navigate(`/identity/edit/${identity.id}`)}
                onDelete={async () => {
                  const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                  if (ok) deleteIdentity(identity.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Identity Edit Page (full-screen route) ──

export function IdentityEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const addIdentity = useIdentityStore((s) => s.addIdentity);
  const updateIdentity = useIdentityStore((s) => s.updateIdentity);

  const existing = id ? getIdentityById(id) : undefined;

  const handleSave = useCallback((data: Omit<Identity, "id" | "createdAt">) => {
    if (existing) {
      updateIdentity(existing.id, data);
    } else {
      addIdentity(data);
    }
    navigate(-1);
  }, [existing, addIdentity, updateIdentity, navigate]);

  return (
    <IdentityForm
      identity={existing}
      onSave={handleSave}
      onClose={() => navigate(-1)}
    />
  );
}

// ── Identity Item (line-separated list style) ──

function IdentityItem({
  identity,
  isLast,
  onEdit,
  onDelete,
}: {
  identity: Identity;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-black/5 transition-colors"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-foreground truncate">{identity.name}</p>
        <p className="text-[13px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
          {identity.systemPrompt}
        </p>
      </div>
      <IoChevronForward size={16} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
    </button>
  );
}

// ── Identity Form (1:1 RN identity-edit.tsx) ──

function IdentityForm({
  identity,
  onSave,
  onClose,
}: {
  identity?: Identity;
  onSave: (data: Omit<Identity, "id" | "createdAt">) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isNew = !identity;
  const [name, setName] = useState(identity?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(identity?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(identity?.params?.temperature ?? 0.7);
  const [topP, setTopP] = useState(identity?.params?.topP ?? 0.9);

  const handleSave = useCallback(() => {
    if (!name.trim() || !systemPrompt.trim()) return;
    onSave({
      name: name.trim(),
      icon: identity?.icon ?? "general",
      systemPrompt: systemPrompt.trim(),
      params: { temperature, topP },
      mcpToolIds: identity?.mcpToolIds ?? [],
      mcpServerIds: identity?.mcpServerIds ?? [],
    });
  }, [name, systemPrompt, temperature, topP, identity, onSave]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      {/* Header (replaces RN Stack navigator header) */}
      <div className="flex-shrink-0 flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)" }}>
        <button onClick={onClose} className="flex items-center px-2 py-1 active:opacity-60">
          <IoChevronBack size={24} color="var(--primary)" />
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center pr-12">
          {isNew ? t("personas.createIdentity") : t("personas.editIdentity")}
        </span>
      </div>

      {/* ScrollView flex-1 bg-bg-light */}
      <div className="flex-1 overflow-y-auto">
        {/* Name — px-4 pt-4 */}
        <div className="px-4 pt-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">{t("identityEdit.name")}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("identityEdit.namePlaceholder")}
            className="w-full rounded-xl px-4 py-3 text-base text-foreground outline-none"
            style={{ backgroundColor: "var(--secondary)" }}
          />
        </div>

        {/* System Prompt — px-4 pt-4 */}
        <div className="px-4 pt-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">{t("identityEdit.systemPrompt")}</p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t("identityEdit.systemPromptPlaceholder")}
            className="w-full rounded-xl px-4 py-3 text-sm leading-5 text-foreground outline-none resize-none"
            style={{ backgroundColor: "var(--secondary)", minHeight: 120 }}
          />
        </div>

        {/* Parameters — px-4 pt-4 */}
        <div className="px-4 pt-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{t("identityEdit.parameters")}</p>
          {/* Temperature ParamSlider */}
          <div className="mt-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{t("identityEdit.temperature")}</span>
              <span className="text-xs font-medium text-foreground">{temperature.toFixed(2)}</span>
            </div>
            <div className="h-10 flex items-center relative">
              <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "var(--muted)" }}>
                <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--primary)", width: `${(temperature / 2) * 100}%` }} />
              </div>
              <input
                type="range" min="0" max="2" step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
          {/* TopP ParamSlider */}
          <div className="mt-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{t("identityEdit.topP")}</span>
              <span className="text-xs font-medium text-foreground">{topP.toFixed(2)}</span>
            </div>
            <div className="h-10 flex items-center relative">
              <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "var(--muted)" }}>
                <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--primary)", width: `${topP * 100}%` }} />
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Save button — px-4 pb-8 pt-6 */}
        <div className="px-4 pb-8 pt-6">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !systemPrompt.trim()}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white active:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {isNew ? t("identityEdit.createIdentity") : t("identityEdit.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
