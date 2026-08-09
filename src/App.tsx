import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  ConfirmDialogProvider,
  appAlert,
  appConfirm,
} from "./components/shared/ConfirmDialogProvider";
import { ToolApprovalDialog } from "./components/shared/ToolApprovalDialog";
import { initDatabase } from "./storage/database";
import { useProviderStore } from "./stores/provider-store";
import { useIdentityStore } from "./stores/identity-store";
import { useMcpStore } from "./stores/mcp-store";
import { useSettingsStore } from "./stores/settings-store";
import { useBuiltInToolsStore } from "./stores/built-in-tools-store";
import { refreshMcpConnections } from "./services/mcp";
import i18n from "./i18n";
const MobileLayout = lazy(() =>
  import("./components/mobile/MobileLayout").then((module) => ({
    default: module.MobileLayout,
  })),
);
const DesktopLayout = lazy(() =>
  import("./components/desktop/DesktopLayout").then((module) => ({
    default: module.DesktopLayout,
  })),
);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768);
    };
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

export default function App() {
  const isMobile = useIsMobile();
  const [ready, setReady] = useState(false);
  const mcpServers = useMcpStore((s) => s.servers);
  const enabledMcpSignature = useMemo(
    () =>
      JSON.stringify(
        mcpServers
          .filter((server) => server.enabled)
          .map((server) => ({
            id: server.id,
            type: server.type,
            url: server.url,
            command: server.command,
            args: server.args,
            env: server.env,
            customHeaders: server.customHeaders,
          })),
      ),
    [mcpServers],
  );

  // Initialize database and load all stores
  useEffect(() => {
    async function init() {
      await initDatabase();
      useSettingsStore.getState().loadFromStorage();
      useProviderStore.getState().loadFromStorage();
      useIdentityStore.getState().loadFromStorage();
      useMcpStore.getState().loadFromStorage();
      useBuiltInToolsStore.getState().loadFromStorage();
      setReady(true);

      // Check for pending file import (Android intent)
      if (window.__TAURI_INTERNALS__) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const data = await invoke<string | null>("check_pending_import");
          if (data) {
            let parsed: { version?: string };
            try {
              parsed = JSON.parse(data) as { version?: string };
            } catch {
              await appAlert(i18n.t("settings.importParseError"));
              return;
            }
            if (
              parsed.version === "3.0" &&
              !(await appConfirm({
                title: i18n.t("settings.importBackup"),
                description: i18n.t("settings.restoreConfirm"),
                confirmText: i18n.t("settings.importBackup"),
                destructive: true,
              }))
            ) {
              return;
            }
            const { importBackupFromString } = await import("./services/backup");
            const result = await importBackupFromString(data);
            if (result.success) {
              useProviderStore.getState().loadFromStorage();
              useSettingsStore.getState().loadFromStorage();
              useIdentityStore.getState().loadFromStorage();
              useMcpStore.getState().loadFromStorage();
              appAlert(i18n.t("settings.importSuccess", result.counts!));
            } else {
              const msg =
                result.errorCode === "UNSUPPORTED_VERSION"
                  ? i18n.t("settings.importUnsupportedVersion", { version: result.errorDetail })
                  : i18n.t("settings.importParseError");
              appAlert(msg);
            }
          }
        } catch {
          /* not in Tauri or no pending import */
        }
      }
    }
    init().catch(console.error);
  }, []);

  useEffect(() => {
    if (!ready) return;
    refreshMcpConnections().catch((err) => console.warn("[App] MCP refresh failed:", err));
  }, [ready, enabledMcpSignature]);

  const loading = (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );

  return (
    <ConfirmDialogProvider>
      <TooltipProvider>
        <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden antialiased">
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={loading}>
              {ready ? isMobile ? <MobileLayout /> : <DesktopLayout /> : loading}
            </Suspense>
          </div>
        </div>
        <Toaster position={isMobile ? "top-center" : "bottom-right"} richColors />
        <ToolApprovalDialog />
      </TooltipProvider>
    </ConfirmDialogProvider>
  );
}
