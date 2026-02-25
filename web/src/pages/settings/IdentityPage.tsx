import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { IoPersonOutline, IoAddCircleOutline, IoTrashOutline, IoChevronForward, IoChevronBack, IoSearchOutline, IoCloseCircle, IoAdd, IoSparkles } from "../../icons";
import { useIdentityStore } from "../../stores/identity-store";
import { useProviderStore } from "../../stores/provider-store";
import { useMcpStore } from "../../stores/mcp-store";
import type { Identity } from "../../../../src/types";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";
import { ApiClient } from "../../../../src/services/api-client";
import { BUILT_IN_TOOLS } from "../../services/built-in-tools";

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
          <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("personas.title")}</h1>
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

  // Form state
  const [name, setName] = useState(identity?.name ?? "");
  const [icon, setIcon] = useState(identity?.icon ?? "general");
  const [systemPrompt, setSystemPrompt] = useState(identity?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(identity?.params?.temperature ?? 0.7);
  const [topP, setTopP] = useState(identity?.params?.topP ?? 0.9);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(identity?.mcpToolIds ?? []);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>(identity?.mcpServerIds ?? []);

  // AI Generate state
  const [aiDesc, setAiDesc] = useState("");
  const [aiModelId, setAiModelId] = useState(enabledModels[0]?.id ?? "");
  const [aiLoading, setAiLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const selectedAiModel = models.find((m) => m.id === aiModelId);

  const handleSave = useCallback(() => {
    if (!name.trim() || !systemPrompt.trim()) return;
    onSave({
      name: name.trim(),
      icon,
      systemPrompt: systemPrompt.trim(),
      params: { temperature, topP },
      mcpToolIds: selectedToolIds,
      mcpServerIds: selectedServerIds,
    });
  }, [name, systemPrompt, temperature, topP, icon, selectedToolIds, selectedServerIds, onSave]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiDesc.trim() || !aiModelId) return;
    const model = models.find((m) => m.id === aiModelId);
    if (!model) return;
    const provider = getProviderById(model.providerId);
    if (!provider) return;

    setAiLoading(true);
    try {
      const baseUrl = provider.baseUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      };
      for (const h of provider.customHeaders ?? []) {
        if (h.name && h.value) headers[h.name] = h.value;
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: model.modelId,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "You generate identity cards for an AI assistant app. Given a description, return ONLY a JSON object with:\n" +
                "- name: short name (2-4 words)\n" +
                "- systemPrompt: a concise system prompt (2-4 sentences) defining the role, expertise, and tone.\n" +
                "Return raw JSON only, no markdown fences.",
            },
            { role: "user", content: aiDesc.trim() },
          ],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      const jsonStr = text.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim();
      const result = JSON.parse(jsonStr);
      if (result.name) setName(String(result.name));
      if (result.systemPrompt) setSystemPrompt(String(result.systemPrompt));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiLoading(false);
    }
  }, [aiDesc, aiModelId, models, getProviderById]);

  const toggleTool = useCallback((toolName: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolName) ? prev.filter((id) => id !== toolName) : [...prev, toolName],
    );
  }, []);

  const toggleServer = useCallback((serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId],
    );
  }, []);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center px-1 py-2">
        <button onClick={onClose} className="flex items-center px-2 py-1 active:opacity-60">
          <IoChevronBack size={24} color="var(--primary)" />
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center pr-12">
          {isNew ? t("personas.createIdentity") : t("personas.editIdentity")}
        </span>
      </div>

      {/* Form — 1:1 RN style */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Generate Card (new only, when models available) */}
        {isNew && enabledModels.length > 0 && (
          <div
            className="mx-4 mt-4 rounded-xl p-4"
            style={{ border: "1px solid rgba(147, 51, 234, 0.2)", backgroundColor: "rgba(147, 51, 234, 0.04)" }}
          >
            <div className="flex items-center gap-2">
              <IoSparkles size={18} color="#9333ea" />
              <span className="text-sm font-semibold" style={{ color: "#6b21a8" }}>{t("identityEdit.aiGenerate")}</span>
            </div>

            <textarea
              className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm text-foreground outline-none resize-none"
              style={{ backgroundColor: "var(--secondary)" }}
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              placeholder={t("identityEdit.aiDescPlaceholder")}
              rows={2}
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setShowModelPicker(true)}
                className="flex-1 flex items-center justify-between rounded-lg px-3 py-2.5 active:opacity-80"
                style={{ border: "1px solid rgba(147, 51, 234, 0.2)", backgroundColor: "var(--card)" }}
              >
                <span className="text-xs text-muted-foreground truncate">
                  {selectedAiModel?.displayName ?? t("identityEdit.aiSelectModel")}
                </span>
                <IoChevronForward size={14} color="var(--muted-foreground)" style={{ transform: "rotate(90deg)" }} />
              </button>

              <button
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiDesc.trim()}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2.5"
                style={{ backgroundColor: aiLoading || !aiDesc.trim() ? "#c084fc" : "#9333ea" }}
              >
                {aiLoading ? (
                  <span className="text-sm font-semibold text-white animate-pulse">...</span>
                ) : (
                  <IoSparkles size={14} color="#fff" />
                )}
                <span className="text-sm font-semibold text-white">{t("identityEdit.generate")}</span>
              </button>
            </div>
          </div>
        )}

        {/* Name */}
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

        {/* System Prompt */}
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

        {/* Parameters */}
        <div className="px-4 pt-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{t("identityEdit.parameters")}</p>
          {/* Temperature */}
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
          {/* TopP */}
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

        {/* Bind MCP Tools */}
        {(BUILT_IN_TOOLS.length > 0 || mcpServers.length > 0) && (
          <div className="px-4 pt-4">
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t("identityEdit.bindTools")}</p>

            {BUILT_IN_TOOLS.map((tool) => {
              const checked = selectedToolIds.includes(tool.name);
              return (
                <button
                  key={tool.name}
                  onClick={() => toggleTool(tool.name)}
                  className="mb-2 w-full flex items-center rounded-lg px-3 py-2.5 active:opacity-70"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <span
                    className="h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 text-xs"
                    style={{
                      borderColor: checked ? "var(--primary)" : "var(--border)",
                      backgroundColor: checked ? "var(--primary)" : "transparent",
                      color: checked ? "white" : "transparent",
                    }}
                  >
                    ✓
                  </span>
                  <div className="ml-2 flex-1 min-w-0 text-left">
                    <p className="text-sm text-foreground">{tool.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{t("identityEdit.builtIn")}</span>
                </button>
              );
            })}

            {mcpServers.map((server) => {
              const checked = selectedServerIds.includes(server.id);
              return (
                <button
                  key={server.id}
                  onClick={() => toggleServer(server.id)}
                  className="mb-2 w-full flex items-center rounded-lg px-3 py-2.5 active:opacity-70"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <span
                    className="h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 text-xs"
                    style={{
                      borderColor: checked ? "var(--primary)" : "var(--border)",
                      backgroundColor: checked ? "var(--primary)" : "transparent",
                      color: checked ? "white" : "transparent",
                    }}
                  >
                    ✓
                  </span>
                  <div className="ml-2 flex-1 min-w-0 text-left">
                    <p className="text-sm text-foreground">{server.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{server.url}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Save */}
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

      {/* Model Picker Modal */}
      {showModelPicker && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowModelPicker(false)}
            aria-label="Close"
          />
          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl max-h-[50%] overflow-hidden"
            style={{ backgroundColor: "var(--background)" }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
              <span className="text-[16px] font-semibold text-foreground">{t("identityEdit.selectModel")}</span>
              <button onClick={() => setShowModelPicker(false)} className="active:opacity-60">
                <IoCloseCircle size={20} color="var(--muted-foreground)" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[40vh] pb-8">
              {enabledModels.map((m) => {
                const active = m.id === aiModelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setAiModelId(m.id); setShowModelPicker(false); }}
                    className="w-full flex items-center px-4 py-3 text-left active:bg-black/5"
                    style={{ backgroundColor: active ? "rgba(147, 51, 234, 0.08)" : "transparent" }}
                  >
                    <span
                      className={`flex-1 text-[14px] ${active ? "font-semibold" : "font-normal"}`}
                      style={{ color: active ? "#6b21a8" : "var(--foreground)" }}
                    >
                      {m.displayName}
                    </span>
                    {active && <span style={{ color: "#9333ea" }}>✓</span>}
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
