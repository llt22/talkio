import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { IoChevronForward, IoChevronBack, IoAddCircleOutline, IoTrashOutline, IoAdd } from "../../icons";
import i18n from "../../i18n";
import { useProviderStore } from "../../stores/provider-store";
import { useSettingsStore, type AppSettings } from "../../stores/settings-store";
import { useConfirm, appAlert } from "../../components/shared/ConfirmDialogProvider";
import { createBackup, downloadBackup, pickAndImportBackup } from "../../services/backup";
import { ProviderEditPage } from "./ProviderEditPage";
import { SttSettingsPage } from "./SttSettingsPage";
import { McpPage, type McpPageHandle } from "./McpPage";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../../components/shared/EmptyState";

// ── Ionicons SVG helpers ──

function IonIcon({ d, color, bg, filled }: { d: string; color: string; bg: string; filled?: boolean }) {
  return (
    <div className="h-10 w-10 flex items-center justify-center rounded-full flex-shrink-0" style={{ backgroundColor: bg }}>
      <svg width="18" height="18" viewBox="0 0 512 512" fill={filled ? color : "none"} stroke={filled ? "none" : color} strokeWidth={filled ? undefined : 32} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  );
}

// Internal sub-page stack
export interface SubPage { id: string; title: string; component: React.ReactNode; headerRight?: React.ReactNode; }

// ── Settings Row (1:1 RN SettingsRow) ──

export function SettingsRow({
  iconPath,
  iconColor,
  iconBg,
  iconFilled,
  label,
  detail,
  onPress,
  isLast = false,
}: {
  iconPath: string;
  iconColor: string;
  iconBg: string;
  iconFilled?: boolean;
  label: string;
  detail?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-4 px-4 py-3 active:bg-black/5 transition-colors"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <IonIcon d={iconPath} color={iconColor} bg={iconBg} filled={iconFilled} />
      <span className="flex-1 text-[16px] font-medium text-foreground text-left">{label}</span>
      <div className="flex items-center flex-shrink-0">
        {detail && <span className="mr-2 text-sm text-muted-foreground">{detail}</span>}
        <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
      </div>
    </button>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-1.5" style={{ backgroundColor: "var(--secondary)" }}>
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Main SettingsPage (1:1 RN original) ──

export function SettingsPage({ onSubPageChange }: { onSubPageChange?: (inSubPage: boolean) => void } = {}) {
  const { t } = useTranslation();
  const providers = useProviderStore((s: ReturnType<typeof useProviderStore.getState>) => s.providers);
  const settings = useSettingsStore((s: ReturnType<typeof useSettingsStore.getState>) => s.settings);
  const updateSettings = useSettingsStore((s: ReturnType<typeof useSettingsStore.getState>) => s.updateSettings);
  const [subPageStack, setSubPageStack] = useState<SubPage[]>([]);
  const mcpRef = useRef<McpPageHandle>(null);
  const stackRef = useRef(subPageStack);
  stackRef.current = subPageStack;

  // Pop triggered internally (from popstate or direct call)
  const popInternal = useCallback(() => {
    setSubPageStack((s) => {
      const next = s.slice(0, -1);
      if (next.length === 0) onSubPageChange?.(false);
      return next;
    });
  }, [onSubPageChange]);

  const push = useCallback((page: SubPage) => {
    setSubPageStack((s) => {
      const next = [...s, page];
      if (next.length === 1) onSubPageChange?.(true);
      return next;
    });
    window.history.pushState({ settingsSubPage: true }, "");
  }, [onSubPageChange]);

  const pop = useCallback(() => {
    if (stackRef.current.length > 0) {
      window.history.back();
    }
  }, []);

  // Listen for browser back (Android back button triggers this)
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (stackRef.current.length > 0) {
        popInternal();
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [popInternal]);

  const top = subPageStack.length > 0 ? subPageStack[subPageStack.length - 1] : null;

  const themeLabel = settings.theme === "dark" ? t("settings.themeDark") : settings.theme === "light" ? t("settings.themeLight") : t("settings.themeSystem");
  const langLabel = settings.language === "zh" ? t("settings.langZh") : settings.language === "en" ? t("settings.langEn") : t("settings.langSystem");

  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Main settings list — always mounted */}
      <div className="absolute inset-0 overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      {/* iOS Large Title */}
      <div className="px-4 pt-2 pb-2">
        <h1 className="text-[20px] font-bold text-foreground tracking-tight">{t("settings.title")}</h1>
      </div>

      {/* ── Group 1: Configuration ── */}
      <SectionHeader label={t("settings.configuration")} />
      <div>
        <SettingsRow
          iconPath="M464 256H48M304 350l96-94-96-94M208 162l-96 94 96 94"
          iconColor="#3b82f6"
          iconBg="rgba(59,130,246,0.1)"
          label={t("settings.providers")}
          detail={t("common.configured", { count: providers.length })}
          onPress={() => push({ id: "providers-list", title: t("settings.providers"), headerRight: (
            <button
              onClick={() => push({ id: "provider-add", title: t("settings.addProvider"), component: <ProviderEditPage onClose={pop} /> })}
              className="p-2 active:opacity-60"
            >
              <IoAdd size={22} color="var(--primary)" />
            </button>
          ), component: <ProvidersListPage onPush={push} onPop={pop} /> })}
        />
        <SettingsRow
          iconPath="M277.42 247a24.68 24.68 0 00-4.08-5.34L223 191.28a23.76 23.76 0 00-5.34-4.08 24.06 24.06 0 00-33.66 33.66 23.76 23.76 0 004.08 5.34l50.38 50.38a24.68 24.68 0 005.34 4.08 24.06 24.06 0 0033.62-33.66zM289 100a24 24 0 00-33.94 0L230.42 124.6a24 24 0 000 33.94l23 23a24 24 0 0033.94 0L312 156.6a24 24 0 000-33.94zM412 280a24 24 0 00-33.94 0L352.6 305.42a24 24 0 000 33.94l23 23a24 24 0 0033.94 0L435 337a24 24 0 000-33.94z"
          iconColor="#8b5cf6"
          iconBg="rgba(139,92,246,0.1)"
          iconFilled
          label={t("settings.mcpTools")}
          onPress={() => push({ id: "mcp-tools", title: t("settings.mcpTools"), headerRight: (
            <button onClick={() => mcpRef.current?.triggerAdd()} className="p-2 active:opacity-60">
              <IoAdd size={22} color="var(--primary)" />
            </button>
          ), component: <McpPage ref={mcpRef} onPush={push} onPop={pop} /> })}
        />
        <SettingsRow
          iconPath="M192 448h128V240a64 64 0 00-128 0zM384 240v-16a128 128 0 00-256 0v16M256 96V56M403.08 108.92l-28.28 28.28M108.92 108.92l28.28 28.28M48 240h32M432 240h32"
          iconColor="#f97316"
          iconBg="rgba(249,115,22,0.1)"
          label={t("settings.sttProvider")}
          detail={settings.sttApiKey ? settings.sttModel : t("settings.sttNotConfigured")}
          onPress={() => push({ id: "stt-settings", title: t("settings.sttProvider"), component: <SttSettingsPage /> })}
          isLast
        />
      </div>

      {/* ── Group 2: Chat ── */}
      <SectionHeader label={t("settings.chat")} />
      <div>
        <div
          className="w-full flex items-center gap-4 px-4 py-3"
          style={{ borderBottom: "none" }}
        >
          <IonIcon
            d="M459.94 53.25a16.06 16.06 0 00-23.22-.56L424.35 65a8 8 0 000 11.31l11.34 11.32a8 8 0 0011.34 0l12.06-12.13a16 16 0 00.85-22.25zM399.34 90L218.82 270.5a9 9 0 00-2.31 3.93L208.16 299a3.91 3.91 0 004.86 4.86l24.55-8.35a9 9 0 003.93-2.31L422 112.66a9 9 0 000-12.66l-9.95-10a9 9 0 00-12.71 0zM386.34 193.66L264.45 315.79A41.08 41.08 0 01238 326.73L208 336l9.33-29.9a41.14 41.14 0 0110.93-26.37L350.34 157.66a8 8 0 0111.31 0l24.69 24.7a8 8 0 010 11.3zM416 224v192a48 48 0 01-48 48H144a48 48 0 01-48-48V192a48 48 0 0148-48h192"
            color="#10b981"
            bg="rgba(16,185,129,0.1)"
          />
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
              <option value={4000}>4K</option>
              <option value={8000}>8K</option>
              <option value={16000}>16K</option>
              <option value={32000}>32K</option>
              <option value={64000}>64K</option>
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

      {/* ── Group 3: Appearance ── */}
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

      {/* ── Group 3: Data ── */}
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

      {/* ── Privacy & Version (1:1 RN) ── */}
      <div className="px-8 mt-4">
        <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 10%, transparent)" }}>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            🛡️ {t("settings.securityTip")}
          </p>
        </div>
        <div className="text-center pb-6">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Talkio</p>
          <p className="mt-1 text-xs text-muted-foreground">v{__APP_VERSION__}</p>
        </div>
      </div>
      </div>

      {/* Sub-pages slide over, each layer on top of the previous */}
      <AnimatePresence>
        {subPageStack.map((page, index) => (
          <motion.div
            key={page.id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0 flex flex-col"
            style={{ backgroundColor: "var(--background)", zIndex: index + 1 }}
          >
            <div className="flex-shrink-0 flex items-center px-1 py-2" style={{ backgroundColor: "var(--background)" }}>
              <button onClick={pop} className="w-12 flex items-center justify-center active:opacity-60">
                <IoChevronBack size={24} color="var(--primary)" />
              </button>
              <span className="text-[17px] font-semibold text-foreground flex-1 text-center">{page.title}</span>
              <div className="w-12 flex items-center justify-center">
                {page.headerRight ?? null}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{page.component}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Providers List Sub-page (1:1 RN original) ──

export function ProvidersListPage({
  onPush,
  onPop,
}: {
  onPush: (page: SubPage) => void;
  onPop: () => void;
}) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const deleteProvider = useProviderStore((s) => s.deleteProvider);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
      <div className="pb-8">
        {providers.length === 0 ? (
          <EmptyState
            icon={<IoAddCircleOutline size={28} color="var(--muted-foreground)" />}
            title={t("models.noModels")}
            subtitle={t("models.configureHint")}
          />
        ) : (
          <div style={{ borderTop: "0.5px solid var(--border)", borderBottom: "0.5px solid var(--border)" }}>
            {providers.map((provider: { id: string; name: string; status: string; baseUrl: string; type: string; enabled?: boolean }, idx: number) => {
              const providerModels = models.filter((m: { providerId: string; enabled: boolean }) => m.providerId === provider.id);
              const activeModels = providerModels.filter((m: { enabled: boolean }) => m.enabled);
              const isConnected = provider.status === "active" || provider.status === "connected";
              const isError = provider.status === "error";
              const isDisabled = provider.enabled === false;
              return (
                <button
                  key={provider.id}
                  onClick={() =>
                    onPush({
                      id: `provider-edit-${provider.id}`,
                      title: provider.name,
                      headerRight: (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await confirm({
                              title: t("common.areYouSure"),
                              description: t("providers.deleteConfirm", { name: provider.name }),
                              destructive: true,
                            });
                            if (ok) {
                              deleteProvider(provider.id);
                              onPop();
                            }
                          }}
                          className="p-2 active:opacity-60"
                          title={t("common.delete")}
                        >
                          <IoTrashOutline size={18} color="var(--destructive)" />
                        </button>
                      ),
                      component: <ProviderEditPage editId={provider.id} onClose={onPop} />,
                    })
                  }
                  className={`w-full flex items-center gap-4 px-4 py-3 text-left active:bg-black/5 transition-colors ${isDisabled ? "opacity-50" : ""}`}
                  style={{ borderBottom: idx < providers.length - 1 ? "0.5px solid var(--border)" : "none" }}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: getAvatarProps(provider.name).color }}
                    >
                      {getAvatarProps(provider.name).initials}
                    </div>
                    <div
                      className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
                      style={{
                        borderColor: "var(--background)",
                        backgroundColor: isConnected ? "var(--success)" : isError ? "var(--destructive)" : "var(--border)",
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-medium text-foreground truncate">{provider.name}</p>
                    <p className="text-[13px] text-muted-foreground truncate">
                      {t("providers.modelsCount", { total: providerModels.length, active: activeModels.length })}
                    </p>
                  </div>
                  <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
