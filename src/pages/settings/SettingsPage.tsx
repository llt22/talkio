import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  IoChevronForward,
  IoChevronBack,
  IoAddCircleOutline,
  IoTrashOutline,
  IoAdd,
} from "../../icons";
import {
  ArrowLeftRight,
  Wrench,
  Mic,
  Minimize2,
  Languages,
  Moon,
  Download,
  Upload,
  type LucideIcon,
} from "lucide-react";
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

// Internal sub-page stack
export interface SubPage {
  id: string;
  title: string;
  component: React.ReactNode;
  headerRight?: React.ReactNode;
}

// ── Settings Row ──

export function SettingsRow({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  detail,
  onPress,
  isLast = false,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  detail?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      className="flex w-full items-center gap-4 px-4 py-3 transition-colors active:bg-black/5"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={18} color={iconColor} />
      </div>
      <span className="text-foreground flex-1 text-left text-[16px] font-medium">{label}</span>
      <div className="flex flex-shrink-0 items-center">
        {detail && <span className="text-muted-foreground mr-2 text-sm">{detail}</span>}
        <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
      </div>
    </button>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-1.5" style={{ backgroundColor: "var(--secondary)" }}>
      <p className="text-muted-foreground text-[13px] font-semibold">{label}</p>
    </div>
  );
}

// ── Main SettingsPage (1:1 RN original) ──

export function SettingsPage({
  onSubPageChange,
}: { onSubPageChange?: (inSubPage: boolean) => void } = {}) {
  const { t } = useTranslation();
  const providers = useProviderStore(
    (s: ReturnType<typeof useProviderStore.getState>) => s.providers,
  );
  const settings = useSettingsStore(
    (s: ReturnType<typeof useSettingsStore.getState>) => s.settings,
  );
  const updateSettings = useSettingsStore(
    (s: ReturnType<typeof useSettingsStore.getState>) => s.updateSettings,
  );
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

  const push = useCallback(
    (page: SubPage) => {
      setSubPageStack((s) => {
        const next = [...s, page];
        if (next.length === 1) onSubPageChange?.(true);
        return next;
      });
      window.history.pushState({ settingsSubPage: true }, "");
    },
    [onSubPageChange],
  );

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

  const themeLabel =
    settings.theme === "dark"
      ? t("settings.themeDark")
      : settings.theme === "light"
        ? t("settings.themeLight")
        : t("settings.themeSystem");
  const langLabel =
    settings.language === "zh"
      ? t("settings.langZh")
      : settings.language === "en"
        ? t("settings.langEn")
        : t("settings.langSystem");

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Main settings list — always mounted */}
      <div
        className="absolute inset-0 overflow-y-auto"
        style={{ backgroundColor: "var(--background)" }}
      >
        {/* iOS Large Title */}
        <div className="px-4 pt-2 pb-2">
          <h1 className="text-foreground text-[20px] font-bold tracking-tight">
            {t("settings.title")}
          </h1>
        </div>

        {/* ── Group 1: Configuration ── */}
        <SectionHeader label={t("settings.configuration")} />
        <div>
          <SettingsRow
            icon={ArrowLeftRight}
            iconColor="#3b82f6"
            iconBg="rgba(59,130,246,0.1)"
            label={t("settings.providers")}
            detail={t("common.configured", { count: providers.length })}
            onPress={() =>
              push({
                id: "providers-list",
                title: t("settings.providers"),
                headerRight: (
                  <button
                    onClick={() =>
                      push({
                        id: "provider-add",
                        title: t("settings.addProvider"),
                        component: <ProviderEditPage onClose={pop} />,
                      })
                    }
                    className="p-2 active:opacity-60"
                  >
                    <IoAdd size={22} color="var(--primary)" />
                  </button>
                ),
                component: <ProvidersListPage onPush={push} onPop={pop} />,
              })
            }
          />
          <SettingsRow
            icon={Wrench}
            iconColor="#8b5cf6"
            iconBg="rgba(139,92,246,0.1)"
            label={t("settings.mcpTools")}
            onPress={() =>
              push({
                id: "mcp-tools",
                title: t("settings.mcpTools"),
                headerRight: (
                  <button
                    onClick={() => mcpRef.current?.triggerAdd()}
                    className="p-2 active:opacity-60"
                  >
                    <IoAdd size={22} color="var(--primary)" />
                  </button>
                ),
                component: <McpPage ref={mcpRef} onPush={push} onPop={pop} />,
              })
            }
          />
          <SettingsRow
            icon={Mic}
            iconColor="#f97316"
            iconBg="rgba(249,115,22,0.1)"
            label={t("settings.sttProvider")}
            detail={settings.sttApiKey ? settings.sttModel : t("settings.sttNotConfigured")}
            onPress={() =>
              push({
                id: "stt-settings",
                title: t("settings.sttProvider"),
                component: <SttSettingsPage />,
              })
            }
            isLast
          />
        </div>

        {/* ── Group 2: Chat ── */}
        <SectionHeader label={t("settings.chat")} />
        <div>
          {/* Context compression */}
          <div
            className="flex w-full items-center gap-4 px-4 py-3"
            style={{ borderBottom: "none" }}
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(16,185,129,0.1)" }}
            >
              <Minimize2 size={18} color="#10b981" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-foreground text-[16px] font-medium">
                {t("settings.contextCompression")}
              </span>
            </div>
            {settings.contextCompressionEnabled && (
              <select
                value={settings.contextCompressionThreshold}
                onChange={(e) =>
                  updateSettings({ contextCompressionThreshold: Number(e.target.value) })
                }
                className="text-muted-foreground flex-shrink-0 cursor-pointer appearance-none rounded-lg px-2 py-1 text-[13px] outline-none"
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
              onClick={() =>
                updateSettings({ contextCompressionEnabled: !settings.contextCompressionEnabled })
              }
              className="relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full transition-colors"
              style={{
                backgroundColor: settings.contextCompressionEnabled
                  ? "var(--primary)"
                  : "var(--muted)",
              }}
            >
              <span
                className="inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform"
                style={{
                  transform: settings.contextCompressionEnabled
                    ? "translateX(20px) translateY(2px)"
                    : "translateX(2px) translateY(2px)",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Group 3: Appearance ── */}
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

        {/* ── Group 3: Data ── */}
        <SectionHeader label={t("settings.dataManagement")} />
        <div>
          <SettingsRow
            icon={Download}
            iconColor="#14b8a6"
            iconBg="rgba(20,184,166,0.1)"
            label={t("settings.exportBackup")}
            onPress={async () => {
              const data = createBackup();
              const saved = await downloadBackup(data);
              if (saved) await appAlert(t("settings.exportSuccess"));
            }}
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
                const msg =
                  result.errorCode === "UNSUPPORTED_VERSION"
                    ? t("settings.importUnsupportedVersion", { version: result.errorDetail })
                    : t("settings.importParseError");
                await appAlert(`${t("settings.importFailed")}: ${msg}`);
              }
            }}
            isLast
          />
        </div>

        {/* ── Privacy & Version (1:1 RN) ── */}
        <div className="mt-4 px-8">
          <div
            className="mb-6 rounded-xl p-4"
            style={{
              backgroundColor: "color-mix(in srgb, var(--primary) 5%, transparent)",
              border: "1px solid color-mix(in srgb, var(--primary) 10%, transparent)",
            }}
          >
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              🛡️ {t("settings.securityTip")}
            </p>
          </div>
          <div className="pb-6 text-center">
            <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
              Talkio
            </p>
            <p className="text-muted-foreground mt-1 text-xs">v{__APP_VERSION__}</p>
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
            <div
              className="flex flex-shrink-0 items-center px-1 py-2"
              style={{ backgroundColor: "var(--background)" }}
            >
              <button
                onClick={pop}
                className="flex w-12 items-center justify-center active:opacity-60"
              >
                <IoChevronBack size={24} color="var(--primary)" />
              </button>
              <span className="text-foreground flex-1 text-center text-[17px] font-semibold">
                {page.title}
              </span>
              <div className="flex w-12 items-center justify-center">
                {page.headerRight ?? null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{page.component}</div>
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
          <div
            style={{
              borderTop: "0.5px solid var(--border)",
              borderBottom: "0.5px solid var(--border)",
            }}
          >
            {providers.map(
              (
                provider: {
                  id: string;
                  name: string;
                  status: string;
                  baseUrl: string;
                  type: string;
                  enabled?: boolean;
                },
                idx: number,
              ) => {
                const providerModels = models.filter(
                  (m: { providerId: string; enabled: boolean }) => m.providerId === provider.id,
                );
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
                    className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors active:bg-black/5 ${isDisabled ? "opacity-50" : ""}`}
                    style={{
                      borderBottom:
                        idx < providers.length - 1 ? "0.5px solid var(--border)" : "none",
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: getAvatarProps(provider.name).color }}
                      >
                        {getAvatarProps(provider.name).initials}
                      </div>
                      <div
                        className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2"
                        style={{
                          borderColor: "var(--background)",
                          backgroundColor: isConnected
                            ? "var(--success)"
                            : isError
                              ? "var(--destructive)"
                              : "var(--border)",
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-[16px] font-medium">
                        {provider.name}
                      </p>
                      <p className="text-muted-foreground truncate text-[13px]">
                        {t("providers.modelsCount", {
                          total: providerModels.length,
                          active: activeModels.length,
                        })}
                      </p>
                    </div>
                    <IoChevronForward
                      size={18}
                      color="var(--muted-foreground)"
                      style={{ opacity: 0.3 }}
                    />
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>
    </div>
  );
}
