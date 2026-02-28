import { useTranslation } from "react-i18next";
import { useMobileNav } from "../../contexts/MobileNavContext";
import { useProviderStore } from "../../stores/provider-store";
import { useSettingsStore, type AppSettings } from "../../stores/settings-store";
import { SettingsRow, SectionHeader } from "../../pages/settings/SettingsPage";
import { createBackup, downloadBackup, pickAndImportBackup } from "../../services/backup";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";
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
          iconPath="M464 256H48M304 350l96-94-96-94M208 162l-96 94 96 94"
          iconColor="#3b82f6"
          iconBg="rgba(59,130,246,0.1)"
          label={t("settings.providers")}
          detail={t("common.configured", { count: providers.length })}
          onPress={() => mobileNav?.pushSettingsProviders()}
        />
        <SettingsRow
          iconPath="M277.42 247a24.68 24.68 0 00-4.08-5.34L223 191.28a23.76 23.76 0 00-5.34-4.08 24.06 24.06 0 00-33.66 33.66 23.76 23.76 0 004.08 5.34l50.38 50.38a24.68 24.68 0 005.34 4.08 24.06 24.06 0 0033.62-33.66zM289 100a24 24 0 00-33.94 0L230.42 124.6a24 24 0 000 33.94l23 23a24 24 0 0033.94 0L312 156.6a24 24 0 000-33.94zM412 280a24 24 0 00-33.94 0L352.6 305.42a24 24 0 000 33.94l23 23a24 24 0 0033.94 0L435 337a24 24 0 000-33.94z"
          iconColor="#8b5cf6"
          iconBg="rgba(139,92,246,0.1)"
          iconFilled
          label={t("settings.mcpTools")}
          onPress={() => mobileNav?.pushSettingsMcpTools()}
        />
        <SettingsRow
          iconPath="M192 448h128V240a64 64 0 00-128 0zM384 240v-16a128 128 0 00-256 0v16M256 96V56M403.08 108.92l-28.28 28.28M108.92 108.92l28.28 28.28M48 240h32M432 240h32"
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
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
          iconPath="M363 176L246 464h-62L300 176zM96 288l30-60 30 60-30 60zm290 0l30-60 30 60-30 60z"
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
          iconPath="M160 136c0-30.62 4.51-61.61 16-88C99.57 81.27 48 159.32 48 248c0 119.29 96.71 216 216 216 88.68 0 166.73-51.57 200-128-26.39 11.49-57.38 16-88 16-119.29 0-216-96.71-216-216z"
          iconColor="#64748b"
          iconBg="rgba(100,116,139,0.1)"
          iconFilled
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
          iconPath="M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40M256 48v288M160 192l96 96 96-96"
          iconColor="#14b8a6"
          iconBg="rgba(20,184,166,0.1)"
          label={t("settings.exportBackup")}
          onPress={async () => { const data = createBackup(); const saved = await downloadBackup(data); if (saved) await appAlert(t("settings.exportSuccess")); }}
        />
        <SettingsRow
          iconPath="M176 48v288M80 192l96-96 96 96M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40"
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
