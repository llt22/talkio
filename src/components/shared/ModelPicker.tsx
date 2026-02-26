import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useProviderStore } from "../../stores/provider-store";
import { getAvatarProps } from "../../lib/avatar-utils";
import type { Model } from "../../types";

interface ModelPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  selectedModelId?: string;
  multiSelect?: boolean;
  onMultiSelect?: (modelIds: string[]) => void;
}

export function ModelPicker({ open, onClose, onSelect, selectedModelId, multiSelect, onMultiSelect }: ModelPickerProps) {
  const { t } = useTranslation();
  const models = useProviderStore((s) => s.models);
  const getProviderById = useProviderStore((s) => s.getProviderById);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearch("");
    }
  }, [open]);

  const toggleModel = useCallback((modelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedIds.size > 0 && onMultiSelect) {
      onMultiSelect(Array.from(selectedIds));
    }
    onClose();
  }, [selectedIds, onMultiSelect, onClose]);

  const enabledModels = useMemo(
    () => models.filter((m) => m.enabled),
    [models],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return enabledModels;
    const q = search.toLowerCase();
    return enabledModels.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
    );
  }, [enabledModels, search]);

  const sections = useMemo(() => {
    const map = new Map<string, { title: string; data: Model[] }>();
    for (const m of filtered) {
      const provider = getProviderById(m.providerId);
      const name = provider?.name ?? "Unknown";
      if (!map.has(name)) map.set(name, { title: name, data: [] });
      map.get(name)!.data.push(m);
    }
    for (const section of map.values()) {
      section.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered, getProviderById]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {multiSelect ? t("chat.addMember") : t("chat.selectModel")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-1">
          <div className="flex items-center rounded-xl px-3 py-2" style={{ backgroundColor: "var(--secondary)" }}>
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("providerEdit.searchModels")}
              className="ml-2 flex-1 text-[15px] text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 mt-2">
          {sections.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {models.length === 0
                ? t("models.noModels")
                : t("chats.noResults")}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <div className="px-5 py-1.5 sticky top-0 z-10" style={{ backgroundColor: "var(--secondary)" }}>
                  <p className="text-[13px] font-semibold text-muted-foreground">{section.title}</p>
                </div>
                {section.data.map((model, idx) => {
                  const { color: mColor, initials: mInitials } = getAvatarProps(model.displayName);
                  const isSelected = multiSelect ? selectedIds.has(model.id) : model.id === selectedModelId;
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (multiSelect) {
                          toggleModel(model.id);
                        } else {
                          onSelect(model.id);
                          onClose();
                        }
                      }}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left active:opacity-70 transition-colors"
                      style={{
                        backgroundColor: isSelected ? "color-mix(in srgb, var(--primary) 8%, var(--background))" : "var(--background)",
                        borderBottom: idx < section.data.length - 1 ? "0.5px solid var(--border)" : "none",
                      }}
                    >
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                        style={{ backgroundColor: mColor }}
                      >
                        {mInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-medium text-foreground truncate">{model.displayName}</p>
                        <p className="text-[13px] text-muted-foreground truncate">{model.modelId}</p>
                      </div>
                      {isSelected && (
                        <Check size={18} className="text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {multiSelect && (
          <div className="pt-3 -mx-6 px-6 border-t border-border">
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="w-full py-2.5 rounded-xl text-[15px] font-semibold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {t("common.confirm")}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
