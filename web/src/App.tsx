import { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { MobileLayout } from "./components/mobile/MobileLayout";
import { DesktopLayout } from "./components/desktop/DesktopLayout";
import { initDatabase } from "./storage/database";
import { useProviderStore } from "./stores/provider-store";
import { useIdentityStore } from "./stores/identity-store";
import { useMcpStore } from "./stores/mcp-store";
import { useSettingsStore } from "./stores/settings-store";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      setIsMobile(
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768
      );
    };
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

export default function App() {
  const isMobile = useIsMobile();
  const [ready, setReady] = useState(false);

  // Initialize database and load all stores
  useEffect(() => {
    async function init() {
      await initDatabase();
      useSettingsStore.getState().loadFromStorage();
      useProviderStore.getState().loadFromStorage();
      useIdentityStore.getState().loadFromStorage();
      useMcpStore.getState().loadFromStorage();
      setReady(true);
    }
    init().catch(console.error);
  }, []);

  return (
    <BrowserRouter>
      <TooltipProvider>
        <div
          className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground antialiased"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="flex-1 min-h-0">
            {ready ? (
              isMobile ? <MobileLayout /> : <DesktopLayout />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-muted-foreground">Loading...</div>
              </div>
            )}
          </div>
        </div>
        <Toaster position={isMobile ? "top-center" : "bottom-right"} richColors />
      </TooltipProvider>
    </BrowserRouter>
  );
}
