import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoTrashOutline, IoChevronBack } from "../../icons";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { useConfirm } from "../../components/shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";

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
  const [showAdd, setShowAdd] = useState(false);

  useImperativeHandle(ref, () => ({ triggerAdd: () => setShowAdd(true) }), []);

  if (showAdd) {
    return <McpServerForm onClose={() => setShowAdd(false)} />;
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
              {servers.map((server, idx) => {
                const status = connectionStatus[server.id] ?? "disconnected";
                const serverTools = tools.filter((t) => t.serverId === server.id);
                const isConnected = status === "connected";
                const isError = status === "error";
                const { color: avatarColor, initials } = getAvatarProps(server.name);
                return (
                  <div
                    key={server.id}
                    className="flex items-center gap-4 px-4 py-3 active:bg-black/5 transition-colors"
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
                    {/* Toggle */}
                    <button
                      onClick={() => updateServer(server.id, { enabled: !server.enabled })}
                      className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors"
                      style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
                    >
                      <span
                        className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
                        style={{ transform: server.enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
                      />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={async () => {
                        const ok = await confirm({ title: t("common.areYouSure"), destructive: true });
                        if (ok) deleteServer(server.id);
                      }}
                      className="p-1.5 active:opacity-60"
                    >
                      <IoTrashOutline size={16} color="var(--destructive)" />
                    </button>
                  </div>
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

// ── MCP Server Form (full-screen, 1:1 RN style) ──

function McpServerForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const addServer = useMcpStore((s) => s.addServer);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const handleSave = useCallback(() => {
    if (!name.trim() || !url.trim()) return;
    addServer({ name: name.trim(), url: url.trim(), enabled: true });
    onClose();
  }, [name, url, addServer, onClose]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--secondary)" }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)" }}>
        <button onClick={onClose} className="w-12 flex items-center justify-center active:opacity-60">
          <IoChevronBack size={24} color="var(--primary)" />
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center">{t("personas.addTool")}</span>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !url.trim()}
          className="px-3 py-1 active:opacity-60 disabled:opacity-30"
        >
          <span className="text-[17px] font-medium" style={{ color: "var(--primary)" }}>{t("common.save")}</span>
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-8">
        <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
          <div className="flex items-center px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)" }}>
            <span className="text-[15px] font-medium text-muted-foreground w-20 flex-shrink-0">{t("toolEdit.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("toolEdit.namePlaceholder")}
              className="flex-1 text-[16px] text-foreground bg-transparent outline-none"
              autoFocus
            />
          </div>
          <div className="flex items-center px-4 py-3">
            <span className="text-[15px] font-medium text-muted-foreground w-20 flex-shrink-0">{t("toolEdit.endpointUrl")}</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000/mcp"
              className="flex-1 text-[16px] text-foreground bg-transparent outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
