import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoChevronBack } from "../../icons";
import { isStdioAvailable } from "../../services/mcp/stdio-transport";
import type { CustomHeader } from "../../types";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { useConfirm, appAlert } from "../../components/shared/ConfirmDialogProvider";
import { EmptyState } from "../../components/shared/EmptyState";
import { BUILT_IN_TOOLS } from "../../services/built-in-tools";
import { mcpConnectionManager } from "../../services/mcp/connection-manager";
import { refreshMcpConnections } from "../../services/mcp";
import { useBuiltInToolsStore } from "../../stores/built-in-tools-store";
import { McpServerCard } from "./McpServerCard";
import { McpServerForm } from "./McpServerForm";

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
      appAlert(`${t("common.error")}: ${t("personas.importInvalidJson")}`);
      return;
    }

    const stdioOk = isStdioAvailable();
    let toImport: Array<{
      name: string; type?: "http" | "stdio"; url: string;
      headers?: CustomHeader[]; command?: string; args?: string[];
      env?: Record<string, string>;
    }> = [];

    if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
      for (const [key, val] of Object.entries(parsed.mcpServers)) {
        const v = val as Record<string, unknown>;
        const url = String((v.url ?? v.endpoint ?? "") as string);
        const hasCommand = !!(v.command);

        let hdrs: CustomHeader[] | undefined;
        if (v.headers && typeof v.headers === "object") {
          hdrs = Object.entries(v.headers as Record<string, string>)
            .map(([k, vv]) => ({ name: k, value: String(vv) }))
            .filter((h) => h.name && h.value);
        }

        if (hasCommand && stdioOk) {
          const args = Array.isArray(v.args) ? (v.args as string[]).map(String) : [];
          const env = v.env && typeof v.env === "object"
            ? Object.fromEntries(Object.entries(v.env as Record<string, unknown>).map(([ek, ev]) => [ek, String(ev)]))
            : undefined;
          toImport.push({ name: String(key), type: "stdio", url: "", command: String(v.command), args, env });
        } else if (url) {
          toImport.push({ name: String(key), url, headers: hdrs });
        }
      }

      if (toImport.length === 0) {
        const isCommandConfig = Object.values(parsed.mcpServers).some((v: any) => v?.command || v?.args);
        appAlert(`${t("common.error")}: ${isCommandConfig && !stdioOk ? t("personas.importCommandNotSupported") : t("personas.importNoTools")}`);
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
      appAlert(`${t("common.error")}: ${t("personas.importNoTools")}`);
      return;
    }

    setIsImporting(true);
    const addedNames: string[] = [];
    try {
      for (const srv of toImport) {
        addServer({
          name: srv.name || "MCP Server",
          type: srv.type,
          url: srv.url,
          customHeaders: srv.headers,
          command: srv.command,
          args: srv.args,
          env: srv.env,
          enabled: false,
        });
        addedNames.push(srv.name || "MCP Server");
      }

      setShowImportModal(false);
      setImportJson("");
      appAlert(
        `${t("common.success")}: ${t("personas.importSuccess", { count: addedNames.length })}\n\n${addedNames.join("\n")}`,
      );
    } catch (err) {
      appAlert(`${t("common.error")}: ${err instanceof Error ? err.message : t("settings.importFailed")}`);
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

            {/* Server cards — hide stdio servers on mobile (no Tauri) */}
            {(() => {
              const stdioOk = isStdioAvailable();
              const visibleServers = stdioOk ? servers : servers.filter((s) => s.type !== "stdio");
              return visibleServers.length > 0 ? (
              <div className="px-4 pt-2 flex flex-col gap-3">
                {visibleServers.map((server) => (
                  <McpServerCard
                    key={server.id}
                    server={server}
                    status={connectionStatus[server.id] ?? "disconnected"}
                    serverTools={tools.filter((t) => t.serverId === server.id)}
                    onEdit={() => pushServerForm(server.id)}
                    onToggle={async () => {
                      const status = connectionStatus[server.id] ?? "disconnected";
                      if (status === "connecting") return;
                      const newEnabled = !server.enabled;
                      updateServer(server.id, { enabled: newEnabled });
                      if (newEnabled) {
                        useMcpStore.getState().setConnectionStatus(server.id, "connecting");
                        try {
                          await refreshMcpConnections();
                          const finalStatus = useMcpStore.getState().connectionStatus[server.id];
                          if (finalStatus === "error") updateServer(server.id, { enabled: false });
                        } catch {
                          updateServer(server.id, { enabled: false });
                          useMcpStore.getState().setConnectionStatus(server.id, "error");
                        }
                      } else {
                        mcpConnectionManager.reset(server.id);
                        useMcpStore.getState().setTools(server.id, []);
                        useMcpStore.getState().setConnectionStatus(server.id, "disconnected");
                      }
                    }}
                    onDelete={async () => {
                      const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                      if (ok) {
                        deleteServer(server.id);
                        mcpConnectionManager.reset(server.id);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="px-4 pt-4 text-[13px] text-muted-foreground">{t("personas.noCustomTools")}</p>
            );
            })()}
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
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg rounded-2xl overflow-hidden shadow-xl"
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
                placeholder={'{\n  "mcpServers": {\n    "weather": { "url": "https://..." },\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n    }\n  }\n}'}
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

