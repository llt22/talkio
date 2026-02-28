import { useTranslation } from "react-i18next";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { useProviderStore } from "../../stores/provider-store";
import { useSettingsStore, type AppSettings } from "../../stores/settings-store";
import { SettingsRow, SectionHeader } from "../../pages/settings/SettingsPage";
import { createBackup, downloadBackup, pickAndImportBackup } from "../../services/backup";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";
import { ArrowLeftRight, Wrench, Mic, Minimize2, Languages, Moon, Download, Upload } from "lucide-react";
import i18n from "../../i18n";

export function SettingsMainContent() {
  const { t } = useTranslation();
  const mobileNav = useMobileNav();
  const providers = useProviderStore((s) => s.providers);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const themeLabel = settings.theme === "dark" ? t("settings.themeDark") : settings.theme === "light" ? t("settings.themeLight") : t("settings.themeSystem");
  const langLabel = settings.language === "zh" ? t("settings.langZh") : settings.language === "en" ? t("settings.langEn") : t("settings.langSystem");

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title */}
      <div className="px-4 pt-2 pb-2">
        <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("settings.title")}</h1>
      </div>

      {/* Configuration */}
      <SectionHeader label={t("settings.configuration")} />
      <div>
        <SettingsRow
          icon={ArrowLeftRight}
          iconColor="#3b82f6"
          iconBg="rgba(59,130,246,0.1)"
          label={t("settings.providers")}
          detail={t("common.configured", { count: providers.length })}
          onPress={() => mobileNav?.pushSettingsProviders()}
        />
        <SettingsRow
          icon={Wrench}
          iconColor="#8b5cf6"
          iconBg="rgba(139,92,246,0.1)"
          label={t("settings.mcpTools")}
          onPress={() => mobileNav?.pushSettingsMcpTools()}
        />
        <SettingsRow
          icon={Mic}
          iconColor="#f97316"
          iconBg="rgba(249,115,22,0.1)"
          label={t("settings.sttProvider")}
          detail={settings.sttApiKey ? settings.sttModel : t("settings.sttNotConfigured")}
          onPress={() => mobileNav?.pushSettingsStt()}
          isLast
        />
      </div>

      {/* Chat */}
      <SectionHeader label={t("settings.chat")} />
      <div>
        <div className="w-full flex items-center gap-4 px-4 py-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
            <Minimize2 size={18} color="#10b981" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[16px] font-medium text-foreground">{t("settings.contextCompression")}</span>
          </div>
          {settings.contextCompressionEnabled && (
            <select
              value={settings.contextCompressionThreshold}
              onChange={(e) => updateSettings({ contextCompressionThreshold: Number(e.target.value) })}
              className="rounded-lg px-2 py-1 text-[13px] text-muted-foreground outline-none appearance-none cursor-pointer flex-shrink-0"
              style={{ backgroundColor: "var(--secondary)" }}
            >
              <option value={8000}>8K</option>
              <option value={16000}>16K</option>
              <option value={32000}>32K</option>
              <option value={64000}>64K</option>
              <option value={128000}>128K</option>
            </select>
          )}
          <div
            onClick={() => updateSettings({ contextCompressionEnabled: !settings.contextCompressionEnabled })}
            className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors cursor-pointer"
            style={{ backgroundColor: settings.contextCompressionEnabled ? "var(--primary)" : "var(--muted)" }}
          >
            <span
              className="inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform"
              style={{ transform: settings.contextCompressionEnabled ? "translateX(20px) translateY(2px)" : "translateX(2px) translateY(2px)" }}
            />
          </div>
        </div>
      </div>

      {/* Appearance */}
      <SectionHeader label={t("settings.appearance")} />
      <div>
        <SettingsRow
          icon={Languages}
          iconColor="#6366f1"
          iconBg="rgba(99,102,241,0.1)"
          label={t("settings.language")}
          detail={langLabel}
          onPress={() => {
            const order: AppSettings["language"][] = ["system", "en", "zh"];
            const idx = order.indexOf(settings.language);
            const next = order[(idx + 1) % order.length];
            updateSettings({ language: next });
            const lng = next === "system" ? (navigator.language?.split("-")[0] ?? "en") : next;
            i18n.changeLanguage(["en", "zh"].includes(lng) ? lng : "en");
          }}
        />
        <SettingsRow
          icon={Moon}
          iconColor="#64748b"
          iconBg="rgba(100,116,139,0.1)"
          label={t("settings.theme")}
          detail={themeLabel}
          onPress={() => {
            const order: AppSettings["theme"][] = ["system", "light", "dark"];
            const idx = order.indexOf(settings.theme);
            updateSettings({ theme: order[(idx + 1) % order.length] });
          }}
          isLast
        />
      </div>

      {/* Data */}
      <SectionHeader label={t("settings.dataManagement")} />
      <div>
        <SettingsRow
          icon={Download}
          iconColor="#14b8a6"
          iconBg="rgba(20,184,166,0.1)"
          label={t("settings.exportBackup")}
          onPress={async () => { const data = createBackup(); const saved = await downloadBackup(data); if (saved) await appAlert(t("settings.exportSuccess")); }}
        />
        <SettingsRow
          icon={Upload}
          iconColor="#f59e0b"
          iconBg="rgba(245,158,11,0.1)"
          label={t("settings.importBackup")}
          onPress={async () => {
            const result = await pickAndImportBackup();
            if (!result) return;
            if (result.success) {
              useProviderStore.getState().loadFromStorage();
              useSettingsStore.getState().loadFromStorage();
              await appAlert(t("settings.importSuccess", result.counts!));
              window.location.reload();
            } else {
              const msg = result.errorCode === "UNSUPPORTED_VERSION"
                ? t("settings.importUnsupportedVersion", { version: result.errorDetail })
                : t("settings.importParseError");
              await appAlert(`${t("settings.importFailed")}: ${msg}`);
            }
          }}
          isLast
        />
      </div>

      {/* Privacy & Version */}
      <div className="px-8 mt-4">
        <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 10%, transparent)" }}>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {t("settings.securityTip")}
          </p>
        </div>
        <div className="text-center pb-6">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Talkio</p>
          <p className="mt-1 text-xs text-muted-foreground">v{__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
