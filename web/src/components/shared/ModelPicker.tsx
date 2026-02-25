import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useProviderStore } from "../../stores/provider-store";

interface ModelPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  selectedModelId?: string;
}

export function ModelPicker({ open, onClose, onSelect, selectedModelId }: ModelPickerProps) {
  const models = useProviderStore((s) => s.models);
  const providers = useProviderStore((s) => s.providers);
  const [search, setSearch] = useState("");

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

  const getProviderName = (providerId: string) => {
    return providers.find((p) => p.id === providerId)?.name ?? "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Select Model</DialogTitle>
        </DialogHeader>

        <div className="px-1">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 mt-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {models.length === 0
                ? "No models available. Add a provider in Settings first."
                : "No models match your search"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelect(model.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    model.id === selectedModelId
                      ? "bg-primary/10"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {model.displayName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {getProviderName(model.providerId)}
                    </p>
                  </div>
                  {model.id === selectedModelId && (
                    <Check size={16} className="text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
