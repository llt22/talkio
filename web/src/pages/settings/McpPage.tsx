import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoTrashOutline, IoChevronBack, IoAdd, IoCloseCircle } from "../../icons";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";
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
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useImperativeHandle(ref, () => ({ triggerAdd: () => setShowAdd(true) }), []);

  if (showAdd) {
    return <McpServerForm onClose={() => setShowAdd(false)} />;
  }

  if (editingServer) {
    return <McpServerForm server={editingServer} onClose={() => setEditingServer(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      <div className="pb-8">
        {servers.length === 0 ? (
          <EmptyState
            icon={<IoAddCircleOutline size={28} color="var(--muted-foreground)" />}
            title={t("personas.noCustomTools")}
            subtitle={t("models.configureHint")}
          />
        ) : (
          <>
            {/* Server list */}
            <div style={{ borderTop: "0.5px solid var(--border)", borderBottom: "0.5px solid var(--border)" }}>
              {servers.map((server) => {
                const status = connectionStatus[server.id] ?? "disconnected";
                const serverTools = tools.filter((t) => t.serverId === server.id);
                const isConnected = status === "connected";
                const isError = status === "error";
                const { color: avatarColor, initials } = getAvatarProps(server.name);
                return (
                  <button
                    key={server.id}
                    onClick={() => setEditingServer(server)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left active:bg-black/5 transition-colors"
                    style={{ borderBottom: "0.5px solid var(--border)" }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials}
                      </div>
                      <div
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 ${status === "connecting" ? "animate-pulse" : ""}`}
                        style={{
                          borderColor: "var(--background)",
                          backgroundColor: isConnected ? "var(--success)" : isError ? "var(--destructive)" : "var(--border)",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-medium text-foreground">{server.name}</p>
                      <p className="text-[13px] text-muted-foreground truncate">
                        {serverTools.length} {t("personas.mcpTools").toLowerCase()}
                      </p>
                    </div>
                    {/* Toggle — stop propagation to prevent edit */}
                    <div
                      onClick={(e) => { e.stopPropagation(); updateServer(server.id, { enabled: !server.enabled }); }}
                      className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors cursor-pointer"
                      style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
                    >
                      <span
                        className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
                        style={{ transform: server.enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
                      />
                    </div>
                    {/* Delete — stop propagation to prevent edit */}
                    <div
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                        if (ok) deleteServer(server.id);
                      }}
                      className="p-1.5 active:opacity-60 cursor-pointer"
                    >
                      <IoTrashOutline size={16} color="var(--destructive)" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tools summary */}
            {tools.length > 0 && (
              <>
                <div className="px-5 py-1.5" style={{ backgroundColor: "var(--secondary)" }}>
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    {t("mcp.availableTools", { count: tools.length })}
                  </p>
                </div>
                <div style={{ borderBottom: "0.5px solid var(--border)" }}>
                  {tools.map((tool, idx) => (
                    <div
                      key={`${tool.serverId}-${tool.name}`}
                      className="px-4 py-2.5"
                      style={{ borderBottom: idx < tools.length - 1 ? "0.5px solid var(--border)" : "none" }}
                    >
                      <p className="text-[13px] font-medium text-foreground">{tool.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// ── MCP Server Form (full-screen, 1:1 RN tool-edit.tsx) ──

function McpServerForm({ server, onClose }: { server?: McpServerConfig; onClose: () => void }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const addServer = useMcpStore((s) => s.addServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const deleteServer = useMcpStore((s) => s.deleteServer);

  const isNew = !server;
  const [name, setName] = useState(server?.name ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>(
    server?.customHeaders?.length ? [...server.customHeaders] : [],
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const serverData = {
      name: name.trim(),
      url: url.trim(),
      enabled,
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
    };

    setSaving(true);
    try {
      if (isNew) {
        const created = addServer(serverData);
        // Test connection after creating
        const tempServer = { id: created.id, name: created.name, url: created.url, enabled: true, customHeaders: serverData.customHeaders };
        try {
          const tools = await Promise.race([
            mcpConnectionManager.discoverTools(tempServer),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Connection timeout (10s)")), 10000)),
          ]);
          useMcpStore.getState().updateServer(created.id, { enabled: true });
          useMcpStore.getState().setTools(created.id, tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, serverId: created.id })));
          useMcpStore.getState().setConnectionStatus(created.id, "connected");
          window.alert(t("toolEdit.testSuccess", { count: tools.length }));
        } catch {
          useMcpStore.getState().setConnectionStatus(created.id, "error");
        }
      } else {
        updateServer(server!.id, serverData);
        // Test connection after updating
        const tempServer = { id: server!.id, name: name.trim(), url: url.trim(), enabled: true, customHeaders: serverData.customHeaders };
        mcpConnectionManager.disconnect(server!.id);
        try {
          const tools = await Promise.race([
            mcpConnectionManager.discoverTools(tempServer),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Connection timeout (10s)")), 10000)),
          ]);
          useMcpStore.getState().setTools(server!.id, tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, serverId: server!.id })));
          useMcpStore.getState().setConnectionStatus(server!.id, "connected");
          window.alert(t("toolEdit.testSuccess", { count: tools.length }));
        } catch {
          useMcpStore.getState().setConnectionStatus(server!.id, "error");
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, url, enabled, headers, isNew, server, addServer, updateServer, onClose, t]);

  const handleTest = useCallback(async () => {
    if (!url.trim()) {
      window.alert(t("toolEdit.endpointRequired"));
      return;
    }
    setTesting(true);
    const validHeaders = headers.filter((h) => h.name.trim() && h.value.trim());
    const tempServer = {
      id: `test-${Date.now()}`,
      name: name.trim() || "Test",
      url: url.trim(),
      enabled: true,
      customHeaders: validHeaders.length > 0 ? validHeaders : undefined,
    };
    try {
      const tools = await Promise.race([
        mcpConnectionManager.discoverTools(tempServer),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Connection timeout (10s)")), 10000)),
      ]);
      window.alert(
        t("toolEdit.testSuccess", { count: tools.length }) +
          (tools.length > 0 ? "\n\n" + tools.map((tool) => `• ${tool.name}`).join("\n") : ""),
      );
    } catch (err) {
      window.alert(`${t("toolEdit.testFailed")}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      mcpConnectionManager.disconnect(tempServer.id);
      setTesting(false);
    }
  }, [url, name, headers, t]);

  const handleDelete = useCallback(async () => {
    if (!server) return;
    const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
    if (ok) {
      deleteServer(server.id);
      onClose();
    }
  }, [server, confirm, deleteServer, onClose, t]);

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
            placeholder="https://mcp.example.com/mcp"
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
              <IoAdd size={22} color="var(--primary)" />
            </button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input
                className="flex-1 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                style={{ backgroundColor: "var(--secondary)" }}
                value={h.name}
                onChange={(e) => {
                  const next = [...headers];
                  next[i] = { ...next[i], name: e.target.value };
                  setHeaders(next);
                }}
                placeholder="Header name"
              />
              <input
                className="flex-[2] rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                style={{ backgroundColor: "var(--secondary)" }}
                value={h.value}
                onChange={(e) => {
                  const next = [...headers];
                  next[i] = { ...next[i], value: e.target.value };
                  setHeaders(next);
                }}
                placeholder="Value"
                type={h.name.toLowerCase().includes("auth") || h.name.toLowerCase().includes("key") ? "password" : "text"}
              />
              <button
                onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                className="active:opacity-60"
              >
                <IoCloseCircle size={20} color="var(--destructive)" />
              </button>
            </div>
          ))}
          {headers.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("toolEdit.headersHint")}</p>
          )}
        </div>

        {/* Test Connection */}
        <div className="px-4 pt-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 active:opacity-70"
            style={{
              border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)",
            }}
          >
            {testing ? (
              <span className="text-sm font-medium animate-pulse" style={{ color: "var(--primary)" }}>{t("toolEdit.testing")}</span>
            ) : (
              <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>{t("toolEdit.testConnection")}</span>
            )}
          </button>
        </div>

        {/* Enabled toggle */}
        <div className="mx-4 mt-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "var(--secondary)" }}>
          <span className="text-sm text-foreground">{t("toolEdit.enabled")}</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors"
            style={{ backgroundColor: enabled ? "var(--primary)" : "var(--muted)" }}
          >
            <span
              className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
              style={{ transform: enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
            />
          </button>
        </div>

        {/* Save + Delete */}
        <div className="px-4 pb-8 pt-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || testing || !name.trim() || !url.trim()}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white active:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {saving ? t("toolEdit.testing") : isNew ? t("toolEdit.addTool") : t("toolEdit.saveChanges")}
          </button>

          {!isNew && (
            <button
              onClick={handleDelete}
              className="w-full py-2 active:opacity-60"
            >
              <span className="text-sm" style={{ color: "var(--destructive)" }}>{t("common.delete")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
