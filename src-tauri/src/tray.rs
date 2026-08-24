use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, WindowEvent};

const TRAY_ID: &str = "main";

/// Tray state: whether closing the main window should hide it, plus the live tray icon.
///
/// The icon only exists while the feature is enabled, so users who keep the default
/// (close = quit) never see a stray tray entry.
#[derive(Default)]
pub struct TrayState {
  close_to_tray: AtomicBool,
  icon: Mutex<Option<TrayIcon>>,
}

impl TrayState {
  pub fn close_to_tray(&self) -> bool {
    self.close_to_tray.load(Ordering::Relaxed)
  }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// Enable or disable close-to-tray. Menu labels come from the web layer so all
/// translations stay in one place (i18next), and are refreshed on language change.
#[tauri::command]
pub fn set_close_to_tray(
  app: AppHandle,
  enabled: bool,
  show_label: String,
  quit_label: String,
) -> Result<(), String> {
  let state = app.state::<TrayState>();
  state.close_to_tray.store(enabled, Ordering::Relaxed);

  let mut icon = state.icon.lock().map_err(|e| e.to_string())?;

  if !enabled {
    // Dropping the TrayIcon removes it from the system tray.
    *icon = None;
    return Ok(());
  }

  let show = MenuItemBuilder::with_id("show", &show_label)
    .build(&app)
    .map_err(|e| e.to_string())?;
  let quit = MenuItemBuilder::with_id("quit", &quit_label)
    .build(&app)
    .map_err(|e| e.to_string())?;
  let menu = MenuBuilder::new(&app)
    .items(&[&show, &quit])
    .build()
    .map_err(|e| e.to_string())?;

  // Already showing: only the labels can have changed.
  if let Some(existing) = icon.as_ref() {
    existing.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    return Ok(());
  }

  let default_icon = app
    .default_window_icon()
    .ok_or_else(|| "no default window icon available for the tray".to_string())?
    .clone();

  let tray = TrayIconBuilder::with_id(TRAY_ID)
    .icon(default_icon)
    .tooltip("Talkio")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "show" => show_main_window(app),
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(tray.app_handle());
      }
    })
    .build(&app)
    .map_err(|e| e.to_string())?;

  *icon = Some(tray);
  Ok(())
}

/// Hide the main window instead of closing it while close-to-tray is on.
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
  if let WindowEvent::CloseRequested { api, .. } = event {
    if window.label() != "main" {
      return;
    }
    if !window.state::<TrayState>().close_to_tray() {
      return;
    }
    api.prevent_close();
    let _ = window.hide();
  }
}
