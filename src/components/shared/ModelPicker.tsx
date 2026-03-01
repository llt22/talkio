import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check, CheckCircle, Circle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { useProviderStore } from "../../stores/provider-store";
import { getAvatarProps } from "../../lib/avatar-utils";
import { groupModelsByProvider } from "../../lib/model-utils";
import type { Model } from "../../types";

interface ModelPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  selectedModelId?: string;
  multiSelect?: boolean;
  onMultiSelect?: (modelIds: string[]) => void;
}

export function ModelPicker({
  open,
  onClose,
  onSelect,
  selectedModelId,
  multiSelect,
  onMultiSelect,
}: ModelPickerProps) {
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[70vh] max-w-sm flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {multiSelect ? t("chat.addMember") : t("chat.selectModel")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-1">
          <div
            className="flex items-center rounded-xl px-3 py-2"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("providerEdit.searchModels")}
              className="text-foreground placeholder:text-muted-foreground/50 ml-2 flex-1 bg-transparent text-[15px] outline-none"
            />
          </div>
        </div>

        <div className="-mx-6 mt-2 flex-1 overflow-y-auto">
          {sections.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              {models.length === 0 ? t("models.noModels") : t("chats.noResults")}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <div
                  className="sticky top-0 z-10 px-5 py-1.5"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <p className="text-muted-foreground text-[13px] font-semibold">{section.title}</p>
                </div>
                {section.data.map((model, idx) => {
                  const { color: mColor, initials: mInitials } = getAvatarProps(model.displayName);
                  const isSelected = multiSelect
                    ? selectedIds.has(model.id)
                    : model.id === selectedModelId;
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
                      className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors active:opacity-70 ${isSelected && multiSelect ? "bg-primary/5" : ""}`}
                      style={{
                        backgroundColor: isSelected
                          ? "color-mix(in srgb, var(--primary) 8%, var(--background))"
                          : "var(--background)",
                        borderBottom:
                          idx < section.data.length - 1 ? "0.5px solid var(--border)" : "none",
                      }}
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: mColor }}
                      >
                        {mInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-[16px] font-medium">
                          {model.displayName}
                        </p>
                        <p className="text-muted-foreground truncate text-[13px]">
                          {model.modelId}
                        </p>
                      </div>
                      {multiSelect ? (
                        isSelected ? (
                          <CheckCircle size={22} className="text-primary flex-shrink-0" />
                        ) : (
                          <Circle size={22} className="text-muted-foreground flex-shrink-0" />
                        )
                      ) : (
                        isSelected && <Check size={18} className="text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {multiSelect && (
          <div className="border-border -mx-6 border-t px-6 pt-3">
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="w-full rounded-xl py-2.5 text-[15px] font-semibold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {t("common.confirm")}
              {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
