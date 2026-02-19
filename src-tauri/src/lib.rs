//! Tauri application library entry point.
//!
//! This module serves as the main entry point for the Tauri application.
//! Command implementations are organized in the `commands` module,
//! and shared types are in the `types` module.

mod bindings;
mod commands;
mod types;
mod utils;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

// Re-export only what's needed externally
pub use types::DEFAULT_QUICK_PANE_SHORTCUT;

/// Application entry point. Sets up all plugins and initializes the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = bindings::generate_bindings();

    // Export TypeScript bindings in debug builds
    #[cfg(debug_assertions)]
    bindings::export_ts_bindings();

    // Build with common plugins
    let mut app_builder = tauri::Builder::default();

    // Single instance plugin must be registered FIRST
    // When user tries to open a second instance, focus the existing window instead
    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = window.show() {
                    log::error!("Single instance: failed to show window: {e}");
                }
                if let Err(e) = window.set_focus() {
                    log::warn!("Single instance: failed to focus window: {e}");
                }
                if let Err(e) = window.unminimize() {
                    log::warn!("Single instance: failed to unminimize window: {e}");
                }
            }
        }));
    }

    // Window state plugin - saves/restores window position and size
    // Note: Only applies to windows listed in capabilities (main window only, not quick-pane)
    #[cfg(desktop)]
    {
        // Only restore SIZE and POSITION — restoring all flags (including
        // MAXIMIZED, FULLSCREEN, VISIBLE, DECORATIONS) can trigger NSPanel
        // style mask changes that crash WebKit's KVO observer.
        app_builder = app_builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .build(),
        );
    }

    // Updater plugin for in-app updates
    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    app_builder = app_builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                // Use Debug level in development, Info in production
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .targets([
                    // Always log to stdout for development
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    // Log to webview console for development
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    // Log to system logs on macOS (appears in Console.app)
                    #[cfg(target_os = "macos")]
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .build(),
        );

    // macOS: Add NSPanel plugin for native panel behavior
    #[cfg(target_os = "macos")]
    {
        app_builder = app_builder.plugin(tauri_nspanel::init());
    }

    app_builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            log::info!("Application starting up");
            log::debug!(
                "App handle initialized for package: {}",
                app.package_info().name
            );

            // Initialize SQLite database for history persistence
            match commands::history::initialize_database(app.handle()) {
                Ok(db_state) => {
                    app.manage(db_state);
                    log::info!("SQLite history database initialized");
                }
                Err(e) => {
                    log::error!("Failed to initialize history database: {e}");
                    // Non-fatal: app can still run without history persistence
                }
            }

            // Set up global shortcut plugin (without any shortcuts - we register them separately)
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::Builder;

                app.handle().plugin(Builder::new().build())?;
            }

            // Quick Pane disabled: NSPanel + WebKit KVO observer causes SIGABRT
            // when window style masks change during app/space switching.
            // TODO: Re-enable once tauri-nspanel fixes the KVO crash.
            log::info!("Quick pane disabled (NSPanel KVO crash workaround)");

            // Register screenshot capture shortcuts (with saved custom shortcuts if any)
            #[cfg(desktop)]
            {
                let (fs_sc, area_sc, win_sc) =
                    commands::preferences::load_screenshot_shortcuts(app.handle());
                if let Err(e) = commands::screenshot::register_screenshot_shortcuts(
                    app.handle(),
                    fs_sc.as_deref(),
                    area_sc.as_deref(),
                    win_sc.as_deref(),
                ) {
                    log::error!("Failed to register screenshot shortcuts: {e}");
                    // Non-fatal: app can still run without screenshot shortcuts
                }
            }

            // macOS: Check Accessibility permission (needed for global shortcuts)
            // If missing, show the main window so the user sees the permission prompt
            #[cfg(target_os = "macos")]
            {
                check_accessibility_permission(app.handle());
            }

            // Hide main window on close instead of quitting (app stays in tray).
            // Defensive: log errors instead of silently ignoring.
            if let Some(main_window) = app.get_webview_window("main") {
                let w = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Err(e) = w.hide() {
                            log::error!("Failed to hide main window on close: {e}");
                        }
                    }
                });
            } else {
                log::warn!("Main window not found during setup — hide-on-close not registered");
            }

            // System tray: Komugi runs in background, shows UI via shortcuts
            {
                let show = MenuItemBuilder::with_id("show", "Show Komugi").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit Komugi").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().cloned().expect("no app icon"))
                    .menu(&menu)
                    .on_menu_event(|app: &tauri::AppHandle, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                if let Err(e) = w.show() {
                                    log::error!("Tray show: failed to show window: {e}");
                                }
                                if let Err(e) = w.set_focus() {
                                    log::warn!("Tray show: failed to focus window: {e}");
                                }
                            } else {
                                log::warn!("Tray show: main window not found");
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                        if let tauri::tray::TrayIconEvent::Click { .. } = event {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if let Err(e) = w.show() {
                                    log::error!("Tray click: failed to show window: {e}");
                                }
                                if let Err(e) = w.set_focus() {
                                    log::warn!("Tray click: failed to focus window: {e}");
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Checks macOS Accessibility permission. Global shortcuts require it.
/// If not granted, shows the main window and opens System Settings.
#[cfg(target_os = "macos")]
fn check_accessibility_permission(app: &tauri::AppHandle) {
    use tauri::Manager;

    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    let trusted = unsafe { AXIsProcessTrusted() };
    if trusted {
        log::info!("Accessibility permission granted");
        return;
    }

    log::warn!("Accessibility permission not granted — global shortcuts won't work");

    // Show main window so user can see the app
    if let Some(w) = app.get_webview_window("main") {
        if let Err(e) = w.show() {
            log::error!("Accessibility check: failed to show window: {e}");
        }
        if let Err(e) = w.set_focus() {
            log::warn!("Accessibility check: failed to focus window: {e}");
        }
    }

    // Open Accessibility settings directly
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_opener::OpenerExt;
        let _ = handle.opener().open_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            None::<&str>,
        );
    });
}
