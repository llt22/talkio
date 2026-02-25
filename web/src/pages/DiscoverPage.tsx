import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IdentityPage } from "./settings/IdentityPage";
import { McpPage } from "./settings/McpPage";

// ── Discover / Personas Page (1:1 RN original) ──

type Tab = "identities" | "tools";

export function DiscoverPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("identities");

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title */}
      <div className="flex-shrink-0 px-4 pt-2 pb-2">
        <h1 className="text-[28px] font-bold text-foreground tracking-tight">{t("personas.title")}</h1>
      </div>

      {/* Segmented Control (1:1 RN original) */}
      <div className="px-5 pb-4 pt-2">
        <div className="flex rounded-xl p-1" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}>
          {(["identities", "tools"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 rounded-lg py-1.5 text-sm font-semibold text-center active:opacity-70 transition-colors"
              style={{
                backgroundColor: activeTab === tab ? "var(--card)" : "transparent",
                color: activeTab === tab ? "var(--primary)" : "var(--muted-foreground)",
                boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab === "identities" ? t("personas.identityCards") : t("personas.mcpTools")}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "identities" && <IdentityPage />}
        {activeTab === "tools" && <McpPage />}
      </div>
    </div>
  );
}
