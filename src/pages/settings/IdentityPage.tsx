import { useState, useCallback, useMemo } from "react";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { IoPersonOutline, IoAddCircleOutline, IoTrashOutline, IoChevronForward, IoChevronBack, IoSearchOutline, IoCloseCircle, IoAdd, IoSparkles } from "../../icons";
import { useIdentityStore } from "../../stores/identity-store";
import { useProviderStore } from "../../stores/provider-store";
import { useMcpStore } from "../../stores/mcp-store";
import { useBuiltInToolsStore } from "../../stores/built-in-tools-store";
import type { Identity } from "../../types";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";
import { BUILT_IN_TOOLS } from "../../services/built-in-tools";
import { ApiClient } from "../../services/api-client";

type IdentityStoreState = ReturnType<typeof useIdentityStore.getState>;

// ── Identity / Persona Page ──

export function IdentityPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const mobileNav = useMobileNav();
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
          <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("personas.title")}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="h-9 w-9 flex items-center justify-center rounded-full active:opacity-60"
            >
              <IoSearchOutline size={22} color="var(--primary)" />
            </button>
            <button
              onClick={() => mobileNav ? mobileNav.pushIdentityNew() : navigate("/identity/new")}
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
          <EmptyState
            icon={<IoPersonOutline size={28} color="var(--muted-foreground)" />}
            title={t("personas.noCustomTools")}
            subtitle={t("models.configureHint")}
          />
        ) : (
          <div className="pb-4">
            {filtered.map((identity: Identity, idx: number) => (
              <IdentityItem
                key={identity.id}
                identity={identity}
                isLast={idx === filtered.length - 1}
                onEdit={() => mobileNav ? mobileNav.pushIdentityEdit(identity.id) : navigate(`/identity/edit/${identity.id}`)}
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

export function IdentityEditPage({ id: idProp, onClose: onCloseProp }: { id?: string; onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = idProp ?? routeId;
  const goBack = onCloseProp ?? (() => navigate(-1));
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
    goBack();
  }, [existing, addIdentity, updateIdentity, goBack]);

  return (
    <IdentityForm
      identity={existing}
      onSave={handleSave}
      onClose={goBack}
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
  const { color: avatarColor, initials } = getAvatarProps(identity.name);
  return (
    <button
      onClick={onEdit}
      className="w-full flex items-center gap-4 px-4 py-3 text-left active:bg-black/5 transition-colors"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-medium text-foreground truncate">{identity.name}</p>
        <p className="text-[13px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
          {identity.systemPrompt}
        </p>
      </div>
      <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
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

  // Provider/model stores for AI generation
  const models = useProviderStore((s) => s.models);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);

  // MCP stores
  const mcpServers = useMcpStore((s) => s.servers);

  // Built-in tools store
  const builtInEnabledByName = useBuiltInToolsStore((s) => s.enabledByName);

  // Form state
  const [name, setName] = useState(identity?.name ?? "");
  const [icon, setIcon] = useState(identity?.icon ?? "general");
  const [systemPrompt, setSystemPrompt] = useState(identity?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(identity?.params?.temperature ?? 0.7);
  const [topP, setTopP] = useState(identity?.params?.topP ?? 0.9);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(identity?.mcpToolIds ?? []);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(identity?.mcpServerIds ?? []);

  const identitySelectableBuiltInTools = useMemo(
    () => BUILT_IN_TOOLS.filter((t_) => builtInEnabledByName[t_.name] === false),
    [builtInEnabledByName],
  );

  // AI Generate state
  const [aiDesc, setAiDesc] = useState("");
  const [aiModelId, setAiModelId] = useState(enabledModels[0]?.id ?? "");
  const [aiLoading, setAiLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const selectedAiModel = models.find((m) => m.id === aiModelId);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      window.alert(`${t("common.error")}: ${t("identityEdit.nameRequired")}`);
      return;
    }
    if (!systemPrompt.trim()) {
      window.alert(`${t("common.error")}: ${t("identityEdit.promptRequired")}`);
      return;
    }

    const identityBoundBuiltInToolNames = selectedToolIds.filter((toolName) => builtInEnabledByName[toolName] === false);

    onSave({
      name: name.trim(),
      icon,
      systemPrompt: systemPrompt.trim(),
      params: { temperature, topP },
      mcpToolIds: identityBoundBuiltInToolNames,
      mcpServerIds: selectedServerIds,
    });
  }, [name, systemPrompt, temperature, topP, icon, selectedToolIds, selectedServerIds, onSave, builtInEnabledByName, t]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiDesc.trim()) {
      window.alert(`${t("common.error")}: ${t("identityEdit.aiDescRequired")}`);
      return;
    }
    if (!aiModelId) {
      window.alert(`${t("common.error")}: ${t("identityEdit.aiSelectModel")}`);
      return;
    }
    const model = models.find((m) => m.id === aiModelId);
    if (!model) return;
    const provider = getProviderById(model.providerId);
    if (!provider) return;

    setAiLoading(true);
    try {
      const client = new ApiClient(provider);
      const icons = "code, translate, architecture, security, finance, writing, research, marketing, design, general";
      const data = await client.chat({
        model: model.modelId,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You generate identity cards for an AI assistant app. Given a description, return ONLY a JSON object with:\n" +
              "- name: short name (2-4 words)\n" +
              `- icon: one of [${icons}]\n` +
              "- systemPrompt: a concise system prompt (2-4 sentences) defining the role, expertise, and tone.\n" +
              "Return raw JSON only, no markdown fences.",
          },
          { role: "user", content: aiDesc.trim() },
        ],
        stream: false,
      });

      const text = data.choices?.[0]?.message?.content ?? "";
      const jsonStr = text.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim();
      const result = JSON.parse(jsonStr);
      if (result.name) setName(String(result.name));
      if (result.icon) setIcon(String(result.icon));
      if (result.systemPrompt) setSystemPrompt(String(result.systemPrompt));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiLoading(false);
    }
  }, [aiDesc, aiModelId, getProviderById, models, t]);

  const toggleTool = useCallback((toolName: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolName) ? prev.filter((tId) => tId !== toolName) : [...prev, toolName],
    );
  }, []);

  const toggleServer = useCallback((serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((sId) => sId !== serverId) : [...prev, serverId],
    );
  }, []);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--secondary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* iOS Navigation Bar */}
      <div className="flex-shrink-0 flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)", borderBottom: "0.5px solid var(--border)" }}>
        <button onClick={onClose} className="min-w-[60px] flex items-center px-2 active:opacity-60">
          <IoChevronBack size={22} color="var(--primary)" />
          <span className="text-[17px]" style={{ color: "var(--primary)" }}>{t("common.cancel")}</span>
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center">
          {isNew ? t("personas.createIdentity") : t("personas.editIdentity")}
        </span>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !systemPrompt.trim()}
          className="min-w-[60px] flex justify-end px-3 py-1 active:opacity-60 disabled:opacity-30"
        >
          <span className="text-[17px] font-semibold" style={{ color: "var(--primary)" }}>{t("common.save")}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-6 pb-8">

          {/* ── Section: AI Generate (new only) ── */}
          {isNew && enabledModels.length > 0 && (
            <>
              <p className="px-4 pb-1.5 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">{t("identityEdit.aiGenerate")}</p>
              <div className="overflow-hidden rounded-[10px] mb-6" style={{ backgroundColor: "var(--card)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
                  <textarea
                    value={aiDesc}
                    onChange={(e) => setAiDesc(e.target.value)}
                    placeholder={t("identityEdit.aiDescPlaceholder")}
                    className="w-full text-[15px] leading-relaxed text-foreground bg-transparent outline-none resize-none"
                    style={{ minHeight: 64 }}
                  />
                </div>
                <div className="flex items-center px-4 py-2.5 gap-3">
                  <button
                    onClick={() => setShowModelPicker(true)}
                    className="flex-1 flex items-center justify-between active:opacity-80"
                  >
                    <span className="text-[15px] text-muted-foreground truncate">
                      {selectedAiModel?.displayName ?? t("identityEdit.aiSelectModel")}
                    </span>
                    <span className="text-[13px] text-muted-foreground ml-1">▾</span>
                  </button>
                  <button
                    onClick={handleAiGenerate}
                    disabled={aiLoading || !aiDesc.trim()}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-white active:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: "#7c3aed" }}
                  >
                    <IoSparkles size={14} color="#fff" />
                    <span className="text-[13px] font-semibold">{t("identityEdit.generate")}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Section: Basic Info ── */}
          <p className="px-4 pb-1.5 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">{t("identityEdit.name")}</p>
          <div className="overflow-hidden rounded-[10px] mb-6" style={{ backgroundColor: "var(--card)" }}>
            <div className="flex items-center px-4 py-0">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("identityEdit.namePlaceholder")}
                className="flex-1 bg-transparent text-[17px] text-foreground outline-none py-[11px]"
              />
            </div>
          </div>

          {/* ── Section: System Prompt ── */}
          <p className="px-4 pb-1.5 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">{t("identityEdit.systemPrompt")}</p>
          <div className="overflow-hidden rounded-[10px] mb-6" style={{ backgroundColor: "var(--card)" }}>
            <div className="px-4 py-3">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t("identityEdit.systemPromptPlaceholder")}
                className="w-full text-[15px] leading-relaxed text-foreground bg-transparent outline-none resize-none"
                style={{ minHeight: 120 }}
              />
            </div>
          </div>

          {/* ── Section: Parameters ── */}
          <p className="px-4 pb-1.5 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">{t("identityEdit.parameters")}</p>
          <div className="overflow-hidden rounded-[10px] mb-6" style={{ backgroundColor: "var(--card)" }}>
            {/* Temperature */}
            <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-foreground">{t("identityEdit.temperature")}</span>
                <span className="text-[15px] font-mono text-muted-foreground tabular-nums">{temperature.toFixed(1)}</span>
              </div>
              <div className="mt-2 relative">
                <div className="w-full h-[4px] rounded-full" style={{ backgroundColor: "var(--muted)" }}>
                  <div className="h-[4px] rounded-full transition-all" style={{ backgroundColor: "var(--primary)", width: `${(temperature / 2) * 100}%` }} />
                </div>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
            {/* Top P */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-foreground">{t("identityEdit.topP")}</span>
                <span className="text-[15px] font-mono text-muted-foreground tabular-nums">{topP.toFixed(2)}</span>
              </div>
              <div className="mt-2 relative">
                <div className="w-full h-[4px] rounded-full" style={{ backgroundColor: "var(--muted)" }}>
                  <div className="h-[4px] rounded-full transition-all" style={{ backgroundColor: "var(--primary)", width: `${topP * 100}%` }} />
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

          {/* ── Section: Tool Binding ── */}
          {(identitySelectableBuiltInTools.length > 0 || mcpServers.length > 0) && (
            <>
              <p className="px-4 pb-1.5 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">{t("identityEdit.bindTools")}</p>

              {identitySelectableBuiltInTools.length > 0 && (
                <div className="overflow-hidden rounded-[10px] mb-3" style={{ backgroundColor: "var(--card)" }}>
                  {identitySelectableBuiltInTools.map((tool, idx) => {
                    const checked = selectedToolIds.includes(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className="flex items-center px-4 py-3"
                        style={{ borderBottom: idx < identitySelectableBuiltInTools.length - 1 ? "0.5px solid var(--border)" : "none" }}
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-[15px] text-foreground">{tool.name}</p>
                          <p className="text-[13px] text-muted-foreground line-clamp-1">{tool.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                          <input type="checkbox" checked={checked} onChange={() => toggleTool(tool.name)} className="sr-only peer" />
                          <div className="w-[51px] h-[31px] rounded-full peer-checked:bg-primary bg-muted-foreground/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[27px] after:w-[27px] after:transition-all after:shadow-sm peer-checked:after:translate-x-5" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {mcpServers.length > 0 && (
                <div className="overflow-hidden rounded-[10px] mb-6" style={{ backgroundColor: "var(--card)" }}>
                  {mcpServers.map((srv, idx) => {
                    const checked = selectedServerIds.includes(srv.id);
                    return (
                      <div
                        key={srv.id}
                        className="flex items-center px-4 py-3"
                        style={{ borderBottom: idx < mcpServers.length - 1 ? "0.5px solid var(--border)" : "none" }}
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-[15px] text-foreground">{srv.name}</p>
                          <p className="text-[13px] text-muted-foreground truncate">{srv.url}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                          <input type="checkbox" checked={checked} onChange={() => toggleServer(srv.id)} className="sr-only peer" />
                          <div className="w-[51px] h-[31px] rounded-full peer-checked:bg-primary bg-muted-foreground/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[27px] after:w-[27px] after:transition-all after:shadow-sm peer-checked:after:translate-x-5" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* Model Picker Bottom Sheet */}
      {showModelPicker && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowModelPicker(false)}
            aria-label="Close"
          />
          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-[14px] max-h-[50%] overflow-hidden"
            style={{ backgroundColor: "var(--background)" }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
              <span className="text-[17px] font-semibold text-foreground">{t("identityEdit.selectModel")}</span>
              <button onClick={() => setShowModelPicker(false)} className="active:opacity-60">
                <IoCloseCircle size={22} color="var(--muted-foreground)" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {enabledModels.map((m) => {
                const active = m.id === aiModelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setAiModelId(m.id); setShowModelPicker(false); }}
                    className="w-full flex items-center px-4 py-3 text-left active:bg-black/5"
                    style={{ borderBottom: "0.5px solid var(--border)" }}
                  >
                    <span
                      className={`flex-1 text-[15px] ${active ? "font-semibold" : "font-normal"}`}
                      style={{ color: active ? "var(--primary)" : "var(--foreground)" }}
                    >
                      {m.displayName}
                    </span>
                    {active && <span className="text-[15px] font-semibold" style={{ color: "var(--primary)" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
