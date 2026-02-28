import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "../../icons";
import type { McpServerConfig, McpTool } from "../../stores/mcp-store";

export function McpServerCard({
  server,
  status,
  serverTools,
  onEdit,
  onToggle,
  onDelete,
}: {
  server: McpServerConfig;
  status: "disconnected" | "connecting" | "connected" | "error";
  serverTools: McpTool[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isConnected = status === "connected";
  const isError = status === "error";
  const isConnecting = status === "connecting";
  const serverType = server.type ?? "http";

  const statusColor = isConnected
    ? "var(--success)"
    : isError
      ? "var(--destructive)"
      : isConnecting
        ? "var(--primary)"
        : "var(--border)";

  const statusText = isConnecting
    ? t("toolEdit.testing")
    : isError
      ? t("toolEdit.testFailed")
      : isConnected
        ? `${serverTools.length} ${t("personas.mcpTools").toLowerCase()}`
        : t("common.disabled");

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "0.5px solid var(--border)", backgroundColor: "var(--card)" }}
    >
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onEdit(); }}
        className="flex items-center gap-3 px-4 py-3 active:bg-black/5 transition-colors cursor-pointer"
      >
        {/* Status dot */}
        <div
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isConnecting ? "animate-pulse" : ""}`}
          style={{ backgroundColor: statusColor }}
        />

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-foreground truncate">{server.name}</p>
            <span
              className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}
            >
              {serverType}
            </span>
          </div>
          <p className={`text-[12px] truncate ${isError ? "text-destructive" : "text-muted-foreground"}`}>
            {serverType === "stdio" ? (server.command ?? "") : server.url}
          </p>
        </div>

        {/* Toggle */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors ${isConnecting ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
          style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform ${isConnecting ? "animate-pulse" : ""}`}
            style={{ transform: server.enabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
          />
        </div>

        {/* Delete */}
        <div
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 active:opacity-60 cursor-pointer"
        >
          <IoTrashOutline size={15} color="var(--destructive)" />
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 flex items-center gap-2" style={{ backgroundColor: "var(--secondary)", borderTop: "0.5px solid var(--border)" }}>
        <span className="text-[11px] text-muted-foreground">{statusText}</span>
      </div>

      {/* Tool list (only when connected and has tools) */}
      {isConnected && serverTools.length > 0 && (
        <div style={{ borderTop: "0.5px solid var(--border)" }}>
          {serverTools.map((tool, idx) => (
            <div
              key={tool.name}
              className="px-4 py-2"
              style={{ borderTop: idx > 0 ? "0.5px solid var(--border)" : "none" }}
            >
              <p className="text-[12px] font-medium text-foreground">{tool.name}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
