import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";
import { getAvatarProps } from "../../lib/avatar-utils";
import { groupModelsByProvider } from "../../lib/model-utils";
import type { Model, Identity } from "../../types";

export interface SelectedMember {
  modelId: string;
  identityId: string | null;
}

// ── Shared content (used by both Dialog wrapper and full-screen page) ──

interface AddMemberContentProps {
  onConfirm: (members: SelectedMember[]) => void;
  confirmLabel?: string;
  /** Minimum members required to enable confirm button (e.g. 2 for group creation) */
  minMembers?: number;
}

export function AddMemberContent({
  onConfirm,
  confirmLabel,
  minMembers = 1,
}: AddMemberContentProps) {
  const { t } = useTranslation();
  const models = useProviderStore((s) => s.models);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const identities = useIdentityStore((s) => s.identities);

  const [search, setSearch] = useState("");
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedMember[]>([]);

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enabledModels;
    const q = search.toLowerCase();
    return enabledModels.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
    );
  }, [enabledModels, search]);

  const sections = useMemo(
    () => groupModelsByProvider(filtered, getProviderById),
    [filtered, getProviderById],
  );

  // Auto-select first model when sections change
  useEffect(() => {
    if (sections.length > 0 && sections[0].data.length > 0) {
      if (!activeModelId || !filtered.find((m) => m.id === activeModelId)) {
        setActiveModelId(sections[0].data[0].id);
      }
    }
  }, [sections, activeModelId, filtered]);

  const activeModel = useMemo(
    () => enabledModels.find((m) => m.id === activeModelId) ?? null,
    [enabledModels, activeModelId],
  );

  const addMember = useCallback((modelId: string, identityId: string | null) => {
    setSelected((prev) => [...prev, { modelId, identityId }]);
  }, []);

  const updateLastMemberRole = useCallback((modelId: string, identityId: string | null) => {
    setSelected((prev) => {
      // Find last member with this modelId
      const lastIdx = prev
        .map((m, i) => (m.modelId === modelId ? i : -1))
        .filter((i) => i >= 0)
        .pop();
      if (lastIdx === undefined) return prev;
      const next = [...prev];
      next[lastIdx] = { ...next[lastIdx], identityId };
      return next;
    });
  }, []);

  // Find the identityId of the last selected member for the active model
  const lastActiveIdentityId = useMemo(() => {
    if (!activeModelId) return undefined;
    const matches = selected.filter((m) => m.modelId === activeModelId);
    return matches.length > 0 ? matches[matches.length - 1].identityId : undefined;
  }, [selected, activeModelId]);

  const removeMember = useCallback((index: number) => {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected.length >= minMembers) {
      onConfirm(selected);
    }
  }, [selected, onConfirm, minMembers]);

  const getModelName = useCallback(
    (modelId: string) => {
      const m = enabledModels.find((m) => m.id === modelId);
      return m?.displayName ?? modelId;
    },
    [enabledModels],
  );

  const getIdentityName = useCallback(
    (identityId: string | null) => {
      if (!identityId) return null;
      const identity = identities.find((i) => i.id === identityId);
      return identity?.name ?? null;
    },
    [identities],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Left: Model list */}
        <div className="border-border flex min-h-0 w-1/2 flex-col border-r">
          <div className="flex-shrink-0 px-2 py-2">
            <div
              className="flex items-center rounded-lg px-2 py-1.5"
              style={{ backgroundColor: "var(--secondary)" }}
            >
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("providerEdit.searchModels")}
                className="text-foreground placeholder:text-muted-foreground/50 ml-1.5 flex-1 bg-transparent text-[13px] outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sections.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-xs">
                {models.length === 0 ? t("models.noModels") : t("chats.noResults")}
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.title}>
                  <div
                    className="sticky top-0 z-10 px-3 py-1"
                    style={{ backgroundColor: "var(--secondary)" }}
                  >
                    <p className="text-muted-foreground text-[11px] font-semibold">
                      {section.title}
                    </p>
                  </div>
                  {section.data.map((model) => {
                    const isActive = model.id === activeModelId;
                    const isSelected = selected.some((m) => m.modelId === model.id);
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          if (!isSelected) addMember(model.id, null);
                          setActiveModelId(model.id);
                        }}
                        className={`flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[13px] transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex-1 truncate">{model.displayName}</span>
                        {isSelected && (
                          <span className="text-primary flex-shrink-0 text-[11px]">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Role list */}
        <div className="flex min-h-0 w-1/2 flex-col">
          {activeModel && lastActiveIdentityId !== undefined ? (
            <>
              <div className="border-border flex-shrink-0 border-b px-3 py-2.5">
                <p className="text-foreground truncate text-[13px] font-semibold">
                  {activeModel.displayName}
                </p>
                <p className="text-muted-foreground text-[11px]">{t("chat.selectRole")}</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {/* No role option */}
                <button
                  onClick={() => updateLastMemberRole(activeModel.id, null)}
                  className="active:bg-muted/50 flex w-full items-center gap-2 px-3 py-3 text-left transition-colors"
                  style={{ borderBottom: "0.5px solid var(--border)" }}
                >
                  <div
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "var(--secondary)" }}
                  >
                    <User size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-foreground flex-1 truncate text-[13px]">
                    {t("chat.noIdentity")}
                  </span>
                  {lastActiveIdentityId === null && (
                    <span className="text-primary text-xs font-semibold">✓</span>
                  )}
                </button>

                {/* Identity options */}
                {identities.map((identity: Identity) => (
                  <button
                    key={identity.id}
                    onClick={() => updateLastMemberRole(activeModel.id, identity.id)}
                    className="active:bg-muted/50 flex w-full items-center gap-2 px-3 py-3 text-left transition-colors"
                    style={{ borderBottom: "0.5px solid var(--border)" }}
                  >
                    <div
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
                      }}
                    >
                      <span className="text-primary text-[10px] font-bold">
                        {identity.name.slice(0, 1)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-[13px]">{identity.name}</p>
                      {identity.systemPrompt && (
                        <p className="text-muted-foreground truncate text-[11px]">
                          {identity.systemPrompt.length > 30
                            ? `${identity.systemPrompt.slice(0, 30)}…`
                            : identity.systemPrompt}
                        </p>
                      )}
                    </div>
                    {lastActiveIdentityId === identity.id && (
                      <span className="text-primary text-xs font-semibold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4">
              <p className="text-muted-foreground text-center text-xs">{t("chat.selectModel")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Selected members + confirm */}
      <div
        className="border-border flex-shrink-0 border-t px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
      >
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {selected.map((m, i) => {
              const modelName = getModelName(m.modelId);
              const identityName = getIdentityName(m.identityId);
              const { color } = getAvatarProps(modelName);
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--foreground)",
                  }}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {modelName}
                  {identityName ? `（${identityName}）` : ""}
                  <button onClick={() => removeMember(i)} className="ml-0.5 hover:opacity-70">
                    <X size={12} className="text-muted-foreground" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={selected.length < minMembers}
          className="w-full rounded-xl py-2.5 text-[15px] font-semibold transition-opacity disabled:opacity-40"
          style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {confirmLabel ?? t("common.confirm")}
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>
    </div>
  );
}

// ── Desktop Dialog wrapper ──

interface AddMemberPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (members: SelectedMember[]) => void;
  minMembers?: number;
  confirmLabel?: string;
}

export function AddMemberPicker({
  open,
  onClose,
  onConfirm,
  minMembers,
  confirmLabel,
}: AddMemberPickerProps) {
  const { t } = useTranslation();

  const handleConfirm = useCallback(
    (members: SelectedMember[]) => {
      onConfirm(members);
      onClose();
    },
    [onConfirm, onClose],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[75vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">{t("chat.addMember")}</DialogTitle>
        </DialogHeader>
        {open && (
          <AddMemberContent
            onConfirm={handleConfirm}
            minMembers={minMembers}
            confirmLabel={confirmLabel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
