import { isDesktop } from "../lib/platform";
import i18n from "../i18n";

/**
 * Push the close-to-tray setting to the Rust side, which owns the tray icon and
 * the window close handler. Menu labels are passed along so translations stay in
 * the web layer; call this again after a language change to refresh them.
 */
export async function syncCloseToTray(enabled: boolean): Promise<void> {
  if (!isDesktop) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_close_to_tray", {
    enabled,
    showLabel: i18n.t("tray.show"),
    quitLabel: i18n.t("tray.quit"),
  });
}
