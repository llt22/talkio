import { useState, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoTrashOutline, IoChevronBack, IoCloudOutline, IoFlashOutline, IoPhonePortraitOutline, IoChevronForward } from "../../icons";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { EmptyState } from "../../components/shared/EmptyState";
import { BUILT_IN_TOOLS } from "../../services/built-in-tools";
import type { CustomHeader } from "../../../../src/types";
import { mcpConnectionManager } from "../../services/mcp/connection-manager";

// ── MCP Tools Page (1:1 RN native style) ──

export interface McpPageHandle { triggerAdd: () => void; }

export const McpPage = forwardRef<McpPageHandle>(function McpPage(_props, ref) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const servers = useMcpStore((s) => s.servers) as McpServerConfig[];
  const tools = useMcpStore((s) => s.tools) as McpTool[];
  const connectionStatus = useMcpStore((s) => s.connectionStatus) as Record<
    string,
    "disconnected" | "connecting" | "connected" | "error"
  >;
  const deleteServer = useMcpStore((s) => s.deleteServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ triggerAdd: () => setEditingServerId("__new__") }), []);

  const editingServer = useMemo(() => {
    if (!editingServerId || editingServerId === "__new__") return null;
    return servers.find((s) => s.id === editingServerId) ?? null;
  }, [editingServerId, servers]);

  if (editingServerId) {
    return (
      <McpServerForm
        server={editingServerId === "__new__" ? undefined : (editingServer ?? undefined)}
        onClose={() => setEditingServerId(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="px-5 pt-4 pb-8 space-y-6">
        {/* Built-in Tools */}
        {BUILT_IN_TOOLS.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium uppercase tracking-tight text-muted-foreground">
              {t("personas.builtInTools")}
            </p>
            <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
              {BUILT_IN_TOOLS.map((tool, idx) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: idx < BUILT_IN_TOOLS.length - 1 ? "0.5px solid var(--border)" : "none" }}
                >
                  <div className="flex items-center flex-1 mr-3">
                    <div className="mr-3 h-9 w-9 flex items-center justify-center rounded-lg" style={{ backgroundColor: "#ecfdf5" }}>
                      <IoPhonePortraitOutline size={18} color="#059669" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{tool.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MCP Servers */}
        <div>
          <p className="mb-2 px-1 text-[13px] font-medium uppercase tracking-tight text-muted-foreground">
            MCP Servers
          </p>
          {servers.length > 0 ? (
            <div className="space-y-3">
              {servers.map((server) => {
                const serverTools = tools.filter((t) => t.serverId === server.id);
                return (
                  <button
                    key={server.id}
                    onClick={() => setEditingServerId(server.id)}
                    className="w-full rounded-xl p-4 text-left active:opacity-80 transition-colors"
                    style={{ backgroundColor: "var(--card)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 flex items-center justify-center rounded-lg" style={{ backgroundColor: "#eff6ff" }}>
                        <IoCloudOutline size={20} color="#2563eb" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-foreground truncate">{server.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="text-[11px] text-muted-foreground flex-1 truncate">{server.url}</p>
                          {server.enabled && serverTools.length > 0 && (
                            <span className="text-[10px] font-medium" style={{ color: "#059669" }}>
                              {serverTools.length} tools
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Toggle — stop propagation */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          updateServer(server.id, { enabled: !server.enabled });
                        }}
                        className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors cursor-pointer"
                        style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
                      >
                        <span
                          className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
                          style={{ transform: server.enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-1 text-[13px] text-muted-foreground">{t("personas.noCustomTools")}</p>
          )}
        </div>
      </div>
    </div>
  );
});

// ── MCP Server Form (full-screen, 1:1 RN tool-edit.tsx) ──

function McpServerForm({
  server,
  onClose,
}: {
  server?: McpServerConfig;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const addServer = useMcpStore((s) => s.addServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const deleteServer = useMcpStore((s) => s.deleteServer);

  const isNew = !server;

  const [name, setName] = useState(server?.name ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [headers, setHeaders] = useState<CustomHeader[]>(server?.customHeaders ?? []);
  const [testing, setTesting] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      window.alert(`${t("common.error")}: ${t("toolEdit.nameRequired")}`);
      return;
    }
    if (!url.trim()) {
      window.alert(`${t("common.error")}: ${t("toolEdit.endpointRequired")}`);
      return;
    }

    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const payload: Omit<McpServerConfig, "id" | "createdAt"> = {
      name: name.trim(),
      url: url.trim(),
      enabled,
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
    };

    if (isNew) {
      const created = addServer(payload);
      if (enabled) mcpConnectionManager.reset(created.id);
    } else {
      updateServer(server.id, payload);
      mcpConnectionManager.reset(server.id);
    }

    onClose();
  }, [addServer, enabled, headers, isNew, name, onClose, server?.id, t, updateServer, url]);

  const handleTest = useCallback(async () => {
    if (!url.trim()) {
      window.alert(`${t("common.error")}: ${t("toolEdit.endpointRequired")}`);
      return;
    }

    setTesting(true);
    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const tempServer: Omit<McpServerConfig, "createdAt"> = {
      id: `test-${Date.now()}`,
      name: name.trim() || "Test",
      url: url.trim(),
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
      enabled: true,
    };

    try {
      const tools = await Promise.race([
        mcpConnectionManager.discoverTools(tempServer),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Connection timeout (10s)")), 10000)),
      ]);
      window.alert(t("toolEdit.testSuccess", { count: tools.length }));
      mcpConnectionManager.disconnect(tempServer.id);
    } catch (err) {
      window.alert(`${t("toolEdit.testFailed")}: ${err instanceof Error ? err.message : "Unknown error"}`);
      mcpConnectionManager.disconnect(tempServer.id);
    } finally {
      setTesting(false);
    }
  }, [headers, name, t, url]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center px-1 py-2">
        <button onClick={onClose} className="w-12 flex items-center justify-center active:opacity-60">
          <IoChevronBack size={24} color="var(--primary)" />
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center pr-12">
          {isNew ? t("personas.addTool") : t("toolEdit.saveChanges")}
        </span>
      </div>

      {/* Form — 1:1 RN tool-edit.tsx */}
      <div className="flex-1 overflow-y-auto">
        {/* Name */}
        <div className="px-4 pt-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">{t("toolEdit.name")}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("toolEdit.namePlaceholder")}
            className="w-full rounded-xl px-4 py-3 text-base text-foreground outline-none"
            style={{ backgroundColor: "var(--secondary)" }}
            autoFocus
          />
        </div>

        {/* URL */}
        <div className="px-4 pt-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">{t("toolEdit.endpointUrl")}</p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000/mcp"
            className="w-full rounded-xl px-4 py-3 text-sm text-foreground outline-none"
            style={{ backgroundColor: "var(--secondary)" }}
          />
        </div>

        {/* Custom Headers */}
        <div className="px-4 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{t("toolEdit.headers")}</p>
            <button
              onClick={() => setHeaders([...headers, { name: "", value: "" }])}
              className="active:opacity-60"
            >
              <IoAddCircleOutline size={22} color="var(--primary)" />
            </button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input
                value={h.name}
                onChange={(e) => {
                  const next = [...headers];
                  next[i] = { ...next[i], name: e.target.value };
                  setHeaders(next);
                }}
                placeholder="Header"
                className="flex-1 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                style={{ backgroundColor: "var(--secondary)" }}
              />
              <input
                value={h.value}
                onChange={(e) => {
                  const next = [...headers];
                  next[i] = { ...next[i], value: e.target.value };
                  setHeaders(next);
                }}
                placeholder="Value"
                className="flex-[2] rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                style={{ backgroundColor: "var(--secondary)" }}
              />
              <button
                onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                className="active:opacity-60"
              >
                <IoTrashOutline size={18} color="var(--destructive)" />
              </button>
            </div>
          ))}
          {headers.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("toolEdit.headersHint")}</p>
          )}
        </div>

        {/* Enabled toggle */}
        <div className="mx-4 mt-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "var(--secondary)" }}>
          <p className="text-sm text-foreground">{t("toolEdit.enabled")}</p>
          <button
            onClick={() => setEnabled((v) => !v)}
            className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors"
            style={{ backgroundColor: enabled ? "var(--primary)" : "var(--muted)" }}
          >
            <span
              className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
              style={{ transform: enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
            />
          </button>
        </div>

        {/* Test Connection */}
        <div className="px-4 pt-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 rounded-xl border py-3 active:opacity-70 disabled:opacity-40"
            style={{ borderColor: "rgba(124, 58, 237, 0.3)", backgroundColor: "rgba(124, 58, 237, 0.06)" }}
          >
            {testing ? (
              <span className="text-sm font-medium animate-pulse" style={{ color: "var(--primary)" }}>{t("toolEdit.testing")}</span>
            ) : (
              <>
                <IoFlashOutline size={18} color="var(--primary)" />
                <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>{t("toolEdit.testConnection")}</span>
              </>
            )}
          </button>
        </div>

        {/* Save + Delete */}
        <div className="px-4 pb-8 pt-6">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !url.trim()}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white active:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {isNew ? t("toolEdit.addTool") : t("toolEdit.saveChanges")}
          </button>

          {!isNew && server && (
            <button
              onClick={async () => {
                const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                if (!ok) return;
                deleteServer(server.id);
                mcpConnectionManager.reset(server.id);
                onClose();
              }}
              className="mt-3 w-full py-2 text-sm active:opacity-70"
              style={{ color: "var(--destructive)" }}
            >
              <span className="text-sm" style={{ color: "var(--destructive)" }}>{t("common.delete")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
