import { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ConfirmDialogProvider, appAlert } from "./components/shared/ConfirmDialogProvider";
import { MobileLayout } from "./components/mobile/MobileLayout";
import { DesktopLayout } from "./components/desktop/DesktopLayout";
import { initDatabase } from "./storage/database";
import { useProviderStore } from "./stores/provider-store";
import { useIdentityStore } from "./stores/identity-store";
import { useMcpStore } from "./stores/mcp-store";
import { useSettingsStore } from "./stores/settings-store";
import { useBuiltInToolsStore } from "./stores/built-in-tools-store";
import { refreshMcpConnections } from "./services/mcp";
import i18n from "./i18n";

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
            const { importBackupFromString } = await import("./services/backup");
            const result = importBackupFromString(data);
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
    refreshMcpConnections().catch(() => {});
  }, [mcpServers]);

  return (
    <BrowserRouter>
      <ConfirmDialogProvider>
        <TooltipProvider>
          <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden antialiased">
            <div className="relative min-h-0 flex-1">
              {ready ? (
                isMobile ? (
                  <MobileLayout />
                ) : (
                  <DesktopLayout />
                )
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-muted-foreground text-sm">Loading...</div>
                </div>
              )}
            </div>
          </div>
          <Toaster position={isMobile ? "top-center" : "bottom-right"} richColors />
        </TooltipProvider>
      </ConfirmDialogProvider>
    </BrowserRouter>
  );
}
