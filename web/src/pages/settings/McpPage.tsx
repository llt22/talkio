import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoTrashOutline, IoChevronBack } from "react-icons/io5";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";

// ── MCP Tools Page (1:1 RN native style) ──

export function McpPage() {
  const { t } = useTranslation();
  const servers = useMcpStore((s) => s.servers) as McpServerConfig[];
  const tools = useMcpStore((s) => s.tools) as McpTool[];
  const connectionStatus = useMcpStore((s) => s.connectionStatus) as Record<
    string,
    "disconnected" | "connecting" | "connected" | "error"
  >;
  const deleteServer = useMcpStore((s) => s.deleteServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const [showAdd, setShowAdd] = useState(false);

  if (showAdd) {
    return <McpServerForm onClose={() => setShowAdd(false)} />;
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      <div className="pb-24">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 px-5">
            <IoAddCircleOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
            <p className="mt-4 text-lg font-semibold text-foreground">{t("personas.noCustomTools")}</p>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              {t("models.configureHint")}
            </p>
          </div>
        ) : (
          <>
            {/* Server list */}
            <div>
              {servers.map((server, idx) => {
                const status = connectionStatus[server.id] ?? "disconnected";
                const serverTools = tools.filter((t) => t.serverId === server.id);
                return (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 px-5 py-3.5 active:bg-black/5 dark:active:bg-white/5 transition-colors"
                    style={{ borderBottom: idx < servers.length - 1 ? "0.5px solid var(--border)" : "none" }}
                  >
                    <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                      status === "connected" ? "bg-green-500" :
                      status === "connecting" ? "bg-yellow-500 animate-pulse" :
                      status === "error" ? "bg-red-500" : "bg-gray-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-foreground">{server.name}</p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        {server.url} · {serverTools.length} {t("personas.mcpTools").toLowerCase()}
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
                      onClick={() => { if (confirm(t("common.areYouSure"))) deleteServer(server.id); }}
                      className="p-1.5 active:opacity-60"
                    >
                      <IoTrashOutline size={16} color="#ef4444" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Tools summary */}
            {tools.length > 0 && (
              <div className="px-5 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Available Tools ({tools.length})
                </p>
                <div>
                  {tools.map((tool, idx) => (
                    <div
                      key={`${tool.serverId}-${tool.name}`}
                      className="px-0 py-2.5"
                      style={{ borderBottom: idx < tools.length - 1 ? "0.5px solid var(--border)" : "none" }}
                    >
                      <p className="text-[13px] font-medium text-foreground">{tool.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add button (sticky at bottom) */}
      <div className="sticky bottom-0 left-0 right-0 px-5 pb-4 pt-2" style={{ backgroundColor: "var(--background)" }}>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 active:opacity-80 text-base font-semibold text-white"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <IoAddCircleOutline size={18} color="white" />
          {t("personas.addTool")}
        </button>
      </div>
    </div>
  );
}

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
      <div className="flex-shrink-0 flex items-center gap-1 px-1 py-2">
        <button onClick={onClose} className="flex items-center gap-0.5 px-2 py-1 active:opacity-60">
          <IoChevronBack size={20} color="var(--primary)" />
          <span className="text-[17px] text-primary">{t("layout.backChats")}</span>
        </button>
        <span className="text-[17px] font-semibold text-foreground flex-1 text-center pr-12">{t("personas.addTool")}</span>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-5">
          <div className="rounded-xl p-4" style={{ backgroundColor: "var(--card)" }}>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{t("toolEdit.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("toolEdit.namePlaceholder")}
              className="w-full text-[16px] text-foreground bg-transparent outline-none py-1"
              autoFocus
            />
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: "var(--card)" }}>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{t("toolEdit.endpointUrl")}</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000/mcp"
              className="w-full text-[16px] text-foreground bg-transparent outline-none py-1"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex-shrink-0 px-5 pb-6 pt-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !url.trim()}
          className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
