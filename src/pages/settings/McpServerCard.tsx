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
      className="overflow-hidden rounded-xl"
      style={{ border: "0.5px solid var(--border)", backgroundColor: "var(--card)" }}
    >
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onEdit();
        }}
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors active:bg-black/5"
      >
        {/* Status dot */}
        <div
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isConnecting ? "animate-pulse" : ""}`}
          style={{ backgroundColor: statusColor }}
        />

        {/* Name + info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-foreground truncate text-[15px] font-semibold">{server.name}</p>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
              style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}
            >
              {serverType}
            </span>
          </div>
          <p
            className={`truncate text-[12px] ${isError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {serverType === "stdio" ? (server.command ?? "") : server.url}
          </p>
        </div>

        {/* Toggle */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors ${isConnecting ? "cursor-wait opacity-50" : "cursor-pointer"}`}
          style={{ backgroundColor: server.enabled ? "var(--primary)" : "var(--muted)" }}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${isConnecting ? "animate-pulse" : ""}`}
            style={{
              transform: server.enabled
                ? "translateX(20px) translateY(2px)"
                : "translateX(2px) translateY(2px)",
            }}
          />
        </div>

        {/* Delete */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="cursor-pointer p-1 active:opacity-60"
        >
          <IoTrashOutline size={15} color="var(--destructive)" />
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 px-4 py-1.5"
        style={{ backgroundColor: "var(--secondary)", borderTop: "0.5px solid var(--border)" }}
      >
        <span className="text-muted-foreground text-[11px]">{statusText}</span>
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
              <p className="text-foreground text-[12px] font-medium">{tool.name}</p>
              <p className="text-muted-foreground line-clamp-1 text-[11px]">{tool.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
