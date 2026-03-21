import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  IoRefreshOutline,
  IoSearchOutline,
  IoCloseCircle,
  IoTrashOutline,
  IoEyeOutline,
  IoConstructOutline,
  IoBulbOutline,
  IoPulseOutline,
} from "../../icons";
import { useProviderStore } from "../../stores/provider-store";
import { sortEnabledFirst, isSameOrder } from "../../lib/model-utils";
import type { Model } from "../../types";

interface ProviderModelListProps {
  providerId: string;
  pulling: boolean;
  onRefresh: () => void;
}

export function ProviderModelList({ providerId, pulling, onRefresh }: ProviderModelListProps) {
  const { t } = useTranslation();

  const models = useProviderStore((s) => s.models);
  const displayModels = useMemo(
    () => models.filter((m) => m.providerId === providerId),
    [models, providerId],
  );
  const toggleModel = useProviderStore((s) => s.toggleModel);
  const setProviderModelsEnabled = useProviderStore((s) => s.setProviderModelsEnabled);
  const addModelById = useProviderStore((s) => s.addModelById);
  const deleteModel = useProviderStore((s) => s.deleteModel);
  const probeModelCapabilities = useProviderStore((s) => s.probeModelCapabilities);

  const [modelSearch, setModelSearch] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [probingModelIds, setProbingModelIds] = useState<Set<string>>(new Set());
  const [modelOrder, setModelOrder] = useState<{ providerId: string; ids: string[] }>(() => {
    const initial = useProviderStore.getState().models.filter((m) => m.providerId === providerId);
    return { providerId, ids: sortEnabledFirst(initial).map((m) => m.id) };
  });

  useEffect(() => {
    if (displayModels.length === 0) return;
    setModelOrder((current) => {
      // providerId 切换：重新初始化顺序
      if (current.providerId !== providerId) {
        return { providerId, ids: sortEnabledFirst(displayModels).map((m) => m.id) };
      }
      // 增量更新：保留已有顺序，追加新模型，移除已删除模型
      const modelIds = new Set(displayModels.map((m) => m.id));
      const nextIds = current.ids.filter((id) => modelIds.has(id));
      const orderedIds = new Set(nextIds);
      for (const m of displayModels) {
        if (!orderedIds.has(m.id)) nextIds.push(m.id);
      }
      return isSameOrder(current.ids, nextIds) ? current : { providerId, ids: nextIds };
    });
  }, [displayModels, providerId]);

  const orderedModels = useMemo(() => {
    const modelsById = new Map(displayModels.map((model) => [model.id, model]));
    const ordered: Model[] = [];

    for (const id of modelOrder.ids) {
      const model = modelsById.get(id);
      if (!model) continue;
      ordered.push(model);
      modelsById.delete(id);
    }

    ordered.push(...modelsById.values());
    return ordered;
  }, [displayModels, modelOrder]);

  const filteredModels = useMemo(() => {
    if (!modelSearch) return orderedModels;
    const query = modelSearch.toLowerCase();
    return orderedModels.filter(
      (m) =>
        m.displayName.toLowerCase().includes(query) || m.modelId.toLowerCase().includes(query),
    );
  }, [orderedModels, modelSearch]);

  const allEnabled = useMemo(() => displayModels.every((m) => m.enabled), [displayModels]);
  const trimmedModelId = newModelId.trim();

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-1">
        <span className="text-muted-foreground text-[13px] font-normal tracking-tight uppercase">
          {t("providerEdit.models")} ({filteredModels.length})
        </span>
        <div className="flex items-center gap-3">
          {displayModels.length > 0 && (
            <button
              onClick={() => setProviderModelsEnabled(providerId, !allEnabled)}
              className="text-[13px] font-medium active:opacity-60"
              style={{ color: "var(--primary)" }}
            >
              {allEnabled ? t("providerEdit.deselectAll") : t("providerEdit.selectAll")}
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={pulling}
            className="flex items-center gap-1 text-[13px] font-medium active:opacity-60"
            style={{ color: "var(--primary)" }}
          >
            <IoRefreshOutline size={14} color="var(--primary)" />
            {t("providerEdit.refresh")}
          </button>
        </div>
      </div>

      <div
        className="mt-3 flex items-center rounded-xl px-3 py-2"
        style={{ backgroundColor: "var(--card)" }}
      >
        <IoSearchOutline size={16} color="var(--muted-foreground)" className="mr-2" />
        <input
          className="text-foreground flex-1 bg-transparent text-[14px] outline-none"
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          placeholder={t("providerEdit.searchModels")}
        />
        {modelSearch && (
          <button onClick={() => setModelSearch("")} className="active:opacity-60">
            <IoCloseCircle size={16} color="var(--muted-foreground)" />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          className="text-foreground flex-1 rounded-xl px-3 py-2.5 text-[14px] outline-none"
          style={{ backgroundColor: "var(--card)" }}
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
          placeholder={t("providerEdit.addModelPlaceholder")}
        />
        <button
          onClick={() => {
            if (!trimmedModelId) return;
            addModelById(providerId, trimmedModelId);
            setNewModelId("");
          }}
          disabled={!trimmedModelId}
          className="rounded-xl px-4 py-2.5 text-[14px] font-medium active:opacity-80"
          style={{
            backgroundColor: trimmedModelId ? "var(--primary)" : "var(--muted)",
            color: trimmedModelId ? "white" : "var(--muted-foreground)",
          }}
        >
          {t("common.add")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <AnimatePresence initial={false}>
        {filteredModels.map((m) => (
          <motion.div
            key={m.id}
            layout
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: "var(--card)" }}
          >
            <div className="flex items-center justify-between">
              <div className="mr-3 min-w-0 flex-1">
                <p
                  className={`truncate text-[15px] font-semibold ${m.enabled ? "text-foreground" : "text-muted-foreground/40"}`}
                >
                  {m.displayName}
                </p>
                <p className="text-muted-foreground truncate text-[12px]">{m.modelId}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={() => toggleModel(m.id)}
                    className="peer sr-only"
                  />
                  <div className="peer-checked:bg-primary bg-muted-foreground/30 h-6 w-11 rounded-full after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                </label>
                <button
                  onClick={() => deleteModel(m.id)}
                  className="p-1 active:opacity-60"
                  title={t("common.delete")}
                >
                  <IoTrashOutline size={16} color="var(--destructive)" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[
                {
                  key: "vision",
                  label: t("providerEdit.vision"),
                  on: m.capabilities?.vision,
                  icon: <IoEyeOutline size={12} />,
                },
                {
                  key: "tools",
                  label: t("providerEdit.tools"),
                  on: m.capabilities?.toolCall,
                  icon: <IoConstructOutline size={12} />,
                },
                {
                  key: "reasoning",
                  label: t("providerEdit.reasoning"),
                  on: m.capabilities?.reasoning,
                  icon: <IoBulbOutline size={12} />,
                },
              ].map((cap) => (
                <span
                  key={cap.key}
                  className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${!cap.on ? "opacity-30" : ""}`}
                  style={{
                    backgroundColor: "var(--muted)",
                    color: cap.on ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  <span style={{ color: cap.on ? "var(--primary)" : "inherit" }}>
                    {cap.icon}
                  </span>
                  {cap.label}
                </span>
              ))}
              <button
                onClick={async () => {
                  setProbingModelIds((prev) => new Set(prev).add(m.id));
                  try {
                    await probeModelCapabilities(m.id);
                  } catch {
                    /* ignore */
                  } finally {
                    setProbingModelIds((prev) => {
                      const next = new Set(prev);
                      next.delete(m.id);
                      return next;
                    });
                  }
                }}
                disabled={probingModelIds.has(m.id)}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60 disabled:opacity-40"
                style={{ backgroundColor: "var(--muted)", color: "var(--primary)" }}
              >
                {probingModelIds.has(m.id) ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <IoPulseOutline size={12} />
                )}
                {t("providerEdit.probe")}
              </button>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
