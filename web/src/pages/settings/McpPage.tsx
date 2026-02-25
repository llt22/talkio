import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoTrashOutline, IoChevronBack, IoFlashOutline } from "../../icons";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";
import { BUILT_IN_TOOLS } from "../../services/built-in-tools";
import type { CustomHeader } from "../../../../src/types";
import { mcpConnectionManager } from "../../services/mcp/connection-manager";
import { useBuiltInToolsStore } from "../../stores/built-in-tools-store";

// ── MCP Tools Page (1:1 RN native style) ──

interface SubPage { id: string; title: string; component: React.ReactNode; headerRight?: React.ReactNode; }

export interface McpPageProps {
  onPush?: (page: SubPage) => void;
  onPop?: () => void;
}

export interface McpPageHandle { triggerAdd: () => void; }

export const McpPage = forwardRef<McpPageHandle, McpPageProps>(function McpPage({ onPush, onPop }, ref) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const builtInEnabledByName = useBuiltInToolsStore((s) => s.enabledByName);
  const setBuiltInToolEnabled = useBuiltInToolsStore((s) => s.setToolEnabled);
  const servers = useMcpStore((s) => s.servers) as McpServerConfig[];
  const tools = useMcpStore((s) => s.tools) as McpTool[];
  const connectionStatus = useMcpStore((s) => s.connectionStatus) as Record<
    string,
    "disconnected" | "connecting" | "connected" | "error"
  >;
  const deleteServer = useMcpStore((s) => s.deleteServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const addServer = useMcpStore((s) => s.addServer);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImportJson = useCallback(async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(importJson.trim());
    } catch {
      window.alert(`${t("common.error")}: ${t("personas.importInvalidJson")}`);
      return;
    }

    let toImport: Array<{ name: string; url: string; headers?: CustomHeader[] }> = [];

    if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
      for (const [key, val] of Object.entries(parsed.mcpServers)) {
        const v = val as Record<string, unknown>;
        const url = String((v.url ?? v.endpoint ?? "") as string);
        const hasCommand = !!(v.command || v.args);

        let hdrs: CustomHeader[] | undefined;
        if (v.headers && typeof v.headers === "object") {
          hdrs = Object.entries(v.headers as Record<string, string>)
            .map(([k, vv]) => ({ name: k, value: String(vv) }))
            .filter((h) => h.name && h.value);
        }

        if (url) {
          toImport.push({ name: String(key), url, headers: hdrs });
        } else if (hasCommand) {
          // Desktop command-based config, skip
        }
      }

      if (toImport.length === 0) {
        const isCommandConfig = Object.values(parsed.mcpServers).some((v: any) => v?.command || v?.args);
        window.alert(`${t("common.error")}: ${isCommandConfig ? t("personas.importCommandNotSupported") : t("personas.importNoTools")}`);
        return;
      }
    } else if (Array.isArray(parsed)) {
      toImport = parsed
        .map((item: any) => ({
          name: String(item?.name ?? ""),
          url: String(item?.url ?? item?.endpoint ?? ""),
        }))
        .filter((s: any) => s.url);
    } else if (parsed?.url || parsed?.endpoint) {
      toImport = [{ name: String(parsed?.name ?? "MCP Server"), url: String(parsed.url ?? parsed.endpoint) }];
    }

    if (toImport.length === 0) {
      window.alert(`${t("common.error")}: ${t("personas.importNoTools")}`);
      return;
    }

    setIsImporting(true);
    const addedNames: string[] = [];
    try {
      for (const srv of toImport) {
        addServer({
          name: srv.name || "MCP Server",
          url: srv.url,
          customHeaders: srv.headers,
          enabled: false,
        });
        addedNames.push(srv.name || "MCP Server");
      }

      setShowImportModal(false);
      setImportJson("");
      window.alert(
        `${t("common.success")}: ${t("personas.importSuccess", { count: addedNames.length })}\n\n${addedNames.join("\n")}`,
      );
    } catch (err) {
      window.alert(`${t("common.error")}: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setIsImporting(false);
    }
  }, [addServer, importJson, t]);

  const pushServerForm = useCallback((serverId?: string) => {
    if (!onPush || !onPop) return;
    const server = serverId ? servers.find((s) => s.id === serverId) : undefined;
    const title = server ? server.name : t("personas.addTool");
    onPush({
      id: serverId ? `mcp-edit-${serverId}` : "mcp-add",
      title,
      component: <McpServerForm server={server} onClose={onPop} />,
    });
  }, [onPush, onPop, servers, t]);

  useImperativeHandle(ref, () => ({ triggerAdd: () => pushServerForm() }), [pushServerForm]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      <div className="pb-8">
        {servers.length === 0 && BUILT_IN_TOOLS.length === 0 ? (
          <EmptyState
            icon={<IoAddCircleOutline size={28} color="var(--muted-foreground)" />}
            title={t("personas.noCustomTools")}
            subtitle={t("models.configureHint")}
          />
        ) : (
          <>
            {/* Built-in Tools (global enable/disable) */}
            {BUILT_IN_TOOLS.length > 0 && (
              <div style={{ borderTop: "0.5px solid var(--border)", borderBottom: "0.5px solid var(--border)" }}>
                <div className="px-5 py-1.5" style={{ backgroundColor: "var(--secondary)" }}>
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    {t("personas.builtInTools")}
                  </p>
                </div>
                {BUILT_IN_TOOLS.map((tool, idx) => {
                  const enabled = builtInEnabledByName[tool.name] !== false;
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center gap-4 px-4 py-3"
                      style={{ borderBottom: idx < BUILT_IN_TOOLS.length - 1 ? "0.5px solid var(--border)" : "none" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{tool.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{tool.description}</p>
                      </div>
                      <div
                        onClick={() => setBuiltInToolEnabled(tool.name, !enabled)}
                        className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors cursor-pointer"
                        style={{ backgroundColor: enabled ? "var(--primary)" : "var(--muted)" }}
                      >
                        <span
                          className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
                          style={{ transform: enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Server list */}
            {servers.length > 0 ? (
              <div style={{ borderTop: "0.5px solid var(--border)", borderBottom: "0.5px solid var(--border)" }}>
                {servers.map((server, idx) => {
                  const status = connectionStatus[server.id] ?? "disconnected";
                  const serverTools = tools.filter((t) => t.serverId === server.id);
                  const isConnected = status === "connected";
                  const isError = status === "error";
                  const { color: avatarColor, initials } = getAvatarProps(server.name);
                  return (
                    <div
                      key={server.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => pushServerForm(server.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") pushServerForm(server.id);
                      }}
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
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          updateServer(server.id, { enabled: !server.enabled });
                        }}
                        className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors"
                        style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
                      >
                        <span
                          className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
                          style={{ transform: server.enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
                        />
                      </div>
                      <div
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                          if (ok) {
                            deleteServer(server.id);
                            mcpConnectionManager.reset(server.id);
                          }
                        }}
                        className="p-1.5 active:opacity-60"
                      >
                        <IoTrashOutline size={16} color="var(--destructive)" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 pt-4 text-[13px] text-muted-foreground">{t("personas.noCustomTools")}</p>
            )}

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

        {/* Actions */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex-1 rounded-xl py-3 active:opacity-70"
              style={{ backgroundColor: "rgba(124, 58, 237, 0.08)", color: "var(--primary)" }}
            >
              <span className="text-[14px] font-semibold">{t("personas.importJson")}</span>
            </button>
            <button
              onClick={() => pushServerForm()}
              className="flex-1 rounded-xl py-3 text-white active:opacity-70"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span className="text-[14px] font-semibold">{t("personas.addTool")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => { if (!isImporting) setShowImportModal(false); }}
            aria-label="Close"
          />
          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: "var(--background)" }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
              <span className="text-[16px] font-semibold text-foreground">{t("personas.importJson")}</span>
              <button
                onClick={() => { if (!isImporting) setShowImportModal(false); }}
                className="active:opacity-60"
              >
                <IoChevronBack size={20} color="var(--muted-foreground)" />
              </button>
            </div>
            <div className="px-4 pt-4 pb-5">
              <p className="text-[13px] text-muted-foreground mb-2">{t("personas.importHint")}</p>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-[13px] font-mono text-foreground outline-none resize-none"
                style={{ backgroundColor: "var(--secondary)", minHeight: 180 }}
                placeholder={'{\n  "mcpServers": {\n    "weather": {\n      "url": "https://..."\n    }\n  }\n}'}
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  disabled={isImporting}
                  className="flex-1 rounded-xl py-3 active:opacity-70 disabled:opacity-50"
                  style={{ backgroundColor: "var(--secondary)" }}
                >
                  <span className="text-[14px] font-semibold text-foreground">{t("common.cancel")}</span>
                </button>
                <button
                  onClick={handleImportJson}
                  disabled={isImporting || !importJson.trim()}
                  className="flex-1 rounded-xl py-3 text-white active:opacity-70 disabled:opacity-50"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  <span className="text-[14px] font-semibold">{t("personas.import")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
