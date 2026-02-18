//! Screenshot capture commands.
//!
//! Provides fullscreen and area-selection screenshot capture via global shortcuts.
//! Screenshots are returned as base64-encoded PNG data for frontend consumption.
//!
//! The actual screen capture uses `xcap` which is macOS-only in this build.
//! On other platforms, capture commands return a "not supported" error.

use std::io::Cursor;
use std::sync::Mutex;
use std::time::SystemTime;

use base64::Engine;
use image::codecs::png::PngEncoder;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::types::{DEFAULT_AREA_SHORTCUT, DEFAULT_FULLSCREEN_SHORTCUT};

// ============================================================================
// Constants
// ============================================================================

/// Maximum screenshot size in bytes before base64 encoding (10 MB)
const MAX_SCREENSHOT_BYTES: u32 = 10_485_760;

/// Window label for the area selection overlay
const AREA_SELECTION_LABEL: &str = "screenshot-selection";

// ============================================================================
// Types (always compiled — needed for specta bindings)
// ============================================================================

/// Result of a successful screenshot capture operation.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ScreenshotResult {
    /// Base64-encoded PNG image data
    pub image_base64: String,
    /// Width of the captured image in pixels
    pub width: u32,
    /// Height of the captured image in pixels
    pub height: u32,
    /// Timestamp of the capture (unix seconds)
    pub captured_at: String,
}

/// Typed errors for screenshot operations.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum ScreenshotError {
    /// Screen recording permission not granted (macOS)
    PermissionDenied { message: String },
    /// No monitor found at the cursor position
    NoMonitorFound,
    /// Screen capture failed
    CaptureFailed { message: String },
    /// Image encoding failed
    EncodingFailed { message: String },
    /// Image exceeds size limit
    ImageTooLarge { max_bytes: u32 },
    /// Feature not available on this platform
    NotSupported { message: String },
}

impl std::fmt::Display for ScreenshotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PermissionDenied { message } => write!(f, "Permission denied: {message}"),
            Self::NoMonitorFound => write!(f, "No monitor found at cursor position"),
            Self::CaptureFailed { message } => write!(f, "Capture failed: {message}"),
            Self::EncodingFailed { message } => write!(f, "Encoding failed: {message}"),
            Self::ImageTooLarge { max_bytes } => {
                write!(f, "Image too large (max {max_bytes} bytes)")
            }
            Self::NotSupported { message } => write!(f, "Not supported: {message}"),
        }
    }
}

// ============================================================================
// macOS Screen Recording Permission
// ============================================================================

#[cfg(target_os = "macos")]
mod permissions {
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    pub fn has_screen_recording_permission() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    pub fn request_screen_recording_permission() -> bool {
        unsafe { CGRequestScreenCaptureAccess() }
    }
}

#[cfg(not(target_os = "macos"))]
mod permissions {
    pub fn has_screen_recording_permission() -> bool {
        true
    }

    pub fn request_screen_recording_permission() -> bool {
        true
    }
}

/// Checks permission and requests it if not granted. Returns error if still denied.
fn ensure_screen_recording_permission() -> Result<(), ScreenshotError> {
    if permissions::has_screen_recording_permission() {
        return Ok(());
    }

    log::warn!("Screen recording permission not granted, requesting...");
    permissions::request_screen_recording_permission();

    if permissions::has_screen_recording_permission() {
        log::info!("Screen recording permission granted after request");
        Ok(())
    } else {
        Err(ScreenshotError::PermissionDenied {
            message: "Screen recording permission is required. Please enable it in System Settings > Privacy & Security > Screen Recording.".to_string(),
        })
    }
}

// ============================================================================
// Image Encoding (cross-platform — uses `image` crate only)
// ============================================================================

/// Encodes an RgbaImage to base64 PNG and wraps it in a ScreenshotResult.
fn encode_image_to_base64(image: &image::RgbaImage) -> Result<ScreenshotResult, ScreenshotError> {
    let mut png_bytes: Vec<u8> = Vec::new();
    let cursor = Cursor::new(&mut png_bytes);
    let encoder = PngEncoder::new(cursor);

    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| ScreenshotError::EncodingFailed {
            message: format!("PNG encoding failed: {e}"),
        })?;

    if png_bytes.len() > MAX_SCREENSHOT_BYTES as usize {
        return Err(ScreenshotError::ImageTooLarge {
            max_bytes: MAX_SCREENSHOT_BYTES,
        });
    }

    let base64_string = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    let captured_at = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| format!("{}", d.as_secs()))
        .unwrap_or_else(|_| "0".to_string());

    log::info!(
        "Encoded screenshot: {}x{}, {} bytes PNG, {} bytes base64",
        image.width(),
        image.height(),
        png_bytes.len(),
        base64_string.len()
    );

    Ok(ScreenshotResult {
        image_base64: base64_string,
        width: image.width(),
        height: image.height(),
        captured_at,
    })
}

// ============================================================================
// Screen Capture (macOS only — uses xcap crate)
// ============================================================================

/// Captures the monitor under the current cursor position.
#[cfg(target_os = "macos")]
fn capture_monitor_at_cursor(app: &AppHandle) -> Result<image::RgbaImage, ScreenshotError> {
    let cursor_pos = app
        .cursor_position()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to get cursor position: {e}"),
        })?;

    log::debug!("Cursor at ({}, {})", cursor_pos.x, cursor_pos.y);

    let monitor =
        xcap::Monitor::from_point(cursor_pos.x as i32, cursor_pos.y as i32).map_err(|e| {
            ScreenshotError::CaptureFailed {
                message: format!("No monitor at cursor position: {e}"),
            }
        })?;

    log::debug!(
        "Capturing monitor: {}x{}",
        monitor.width(),
        monitor.height()
    );

    let image = monitor
        .capture_image()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Screen capture failed: {e}"),
        })?;

    Ok(image)
}

#[cfg(not(target_os = "macos"))]
fn capture_monitor_at_cursor(_app: &AppHandle) -> Result<image::RgbaImage, ScreenshotError> {
    Err(ScreenshotError::NotSupported {
        message: "Screen capture is currently only supported on macOS".to_string(),
    })
}

// ============================================================================
// Pending Capture Storage (for area selection flow)
// ============================================================================

/// Holds the captured image while the user draws the selection rectangle.
static PENDING_CAPTURE: Mutex<Option<image::RgbaImage>> = Mutex::new(None);

fn store_pending_capture(image: image::RgbaImage) -> Result<(), ScreenshotError> {
    let mut pending = PENDING_CAPTURE
        .lock()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to lock pending capture: {e}"),
        })?;
    *pending = Some(image);
    Ok(())
}

fn take_pending_capture() -> Result<image::RgbaImage, ScreenshotError> {
    let mut pending = PENDING_CAPTURE
        .lock()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to lock pending capture: {e}"),
        })?;
    pending.take().ok_or(ScreenshotError::CaptureFailed {
        message: "No pending capture found".to_string(),
    })
}

fn clear_pending_capture() {
    if let Ok(mut pending) = PENDING_CAPTURE.lock() {
        *pending = None;
    }
}

// ============================================================================
// Selection Overlay Window
// ============================================================================

fn open_selection_overlay(app: &AppHandle) -> Result<(), ScreenshotError> {
    use tauri::webview::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let cursor_pos = app
        .cursor_position()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to get cursor position: {e}"),
        })?;

    let monitor = app
        .monitor_from_point(cursor_pos.x, cursor_pos.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or(ScreenshotError::NoMonitorFound)?;

    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();

    // Close existing overlay if any
    close_selection_overlay(app);

    WebviewWindowBuilder::new(
        app,
        AREA_SELECTION_LABEL,
        WebviewUrl::App("screenshot-selection.html".into()),
    )
    .title("")
    .position(monitor_pos.x as f64 / scale, monitor_pos.y as f64 / scale)
    .inner_size(
        monitor_size.width as f64 / scale,
        monitor_size.height as f64 / scale,
    )
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(true)
    .build()
    .map_err(|e| ScreenshotError::CaptureFailed {
        message: format!("Failed to create selection overlay: {e}"),
    })?;

    log::info!("Selection overlay opened");
    Ok(())
}

fn close_selection_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(AREA_SELECTION_LABEL) {
        let _ = window.close();
        log::debug!("Selection overlay closed");
    }
}

// ============================================================================
// Commands (always compiled — needed for specta bindings)
// ============================================================================

/// Captures a fullscreen screenshot of the monitor under the cursor.
#[tauri::command]
#[specta::specta]
pub async fn capture_fullscreen(app: AppHandle) -> Result<ScreenshotResult, ScreenshotError> {
    log::info!("Capturing fullscreen screenshot");

    ensure_screen_recording_permission()?;

    let image = capture_monitor_at_cursor(&app)?;
    let result = encode_image_to_base64(&image)?;

    let _ = app.emit("screenshot-captured", &result);

    Ok(result)
}

/// Checks whether screen recording permission is currently granted.
#[tauri::command]
#[specta::specta]
pub fn check_screen_recording_permission() -> bool {
    permissions::has_screen_recording_permission()
}

/// Opens the macOS Screen Recording settings pane.
#[tauri::command]
#[specta::specta]
pub async fn open_screen_recording_settings(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
                None::<&str>,
            )
            .map_err(|e| format!("Failed to open System Settings: {e}"))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Starts area selection: captures the screen first, then opens the selection overlay.
#[tauri::command]
#[specta::specta]
pub async fn start_area_selection(app: AppHandle) -> Result<(), ScreenshotError> {
    log::info!("Starting area selection for screenshot");

    ensure_screen_recording_permission()?;

    // Capture BEFORE opening overlay so the overlay is not in the screenshot
    let image = capture_monitor_at_cursor(&app)?;
    store_pending_capture(image)?;

    open_selection_overlay(&app)?;

    Ok(())
}

/// Completes area selection with the given region coordinates.
/// Called from the overlay window after the user finishes drawing.
#[tauri::command]
#[specta::specta]
pub async fn complete_area_selection(
    app: AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ScreenshotResult, ScreenshotError> {
    log::info!("Completing area selection: ({x}, {y}) {width}x{height}");

    let image = take_pending_capture()?;

    // Clamp to image bounds
    let img_w = image.width();
    let img_h = image.height();
    let safe_x = x.min(img_w.saturating_sub(1));
    let safe_y = y.min(img_h.saturating_sub(1));
    let safe_w = width.min(img_w.saturating_sub(safe_x));
    let safe_h = height.min(img_h.saturating_sub(safe_y));

    if safe_w == 0 || safe_h == 0 {
        return Err(ScreenshotError::CaptureFailed {
            message: "Selection area is empty".to_string(),
        });
    }

    let cropped = image::imageops::crop_imm(&image, safe_x, safe_y, safe_w, safe_h).to_image();
    let result = encode_image_to_base64(&cropped)?;

    close_selection_overlay(&app);
    let _ = app.emit("screenshot-captured", &result);

    Ok(result)
}

/// Cancels the area selection and closes the overlay.
#[tauri::command]
#[specta::specta]
pub fn cancel_area_selection(app: AppHandle) {
    log::info!("Area selection cancelled");
    clear_pending_capture();
    close_selection_overlay(&app);
}

// ============================================================================
// Shortcut Registration
// ============================================================================

/// Tracks currently registered screenshot shortcuts for selective unregistration.
static CURRENT_FULLSCREEN_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_AREA_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// Registers both screenshot global shortcuts. Called from setup().
#[cfg(desktop)]
pub fn register_screenshot_shortcuts(app: &AppHandle) -> Result<(), String> {
    register_fullscreen_shortcut(app, DEFAULT_FULLSCREEN_SHORTCUT)?;
    register_area_shortcut(app, DEFAULT_AREA_SHORTCUT)?;
    log::info!("Screenshot shortcuts registered");
    Ok(())
}

#[cfg(desktop)]
fn register_fullscreen_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let global_shortcut = app.global_shortcut();

    let mut current = CURRENT_FULLSCREEN_SHORTCUT
        .lock()
        .map_err(|e| format!("Failed to lock mutex: {e}"))?;

    if let Some(old) = current.take() {
        if let Ok(parsed) = old.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(parsed);
        }
    }

    let app_handle = app.clone();
    global_shortcut
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                log::info!("Fullscreen screenshot shortcut triggered");
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    match capture_fullscreen(handle).await {
                        Ok(r) => log::info!("Screenshot captured: {}x{}", r.width, r.height),
                        Err(e) => log::error!("Screenshot capture failed: {e}"),
                    }
                });
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{shortcut}': {e}"))?;

    *current = Some(shortcut.to_string());
    log::debug!("Registered fullscreen shortcut: {shortcut}");
    Ok(())
}

#[cfg(desktop)]
fn register_area_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let global_shortcut = app.global_shortcut();

    let mut current = CURRENT_AREA_SHORTCUT
        .lock()
        .map_err(|e| format!("Failed to lock mutex: {e}"))?;

    if let Some(old) = current.take() {
        if let Ok(parsed) = old.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(parsed);
        }
    }

    let app_handle = app.clone();
    global_shortcut
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                log::info!("Area selection shortcut triggered");
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = start_area_selection(handle).await {
                        log::error!("Area selection failed: {e}");
                    }
                });
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{shortcut}': {e}"))?;

    *current = Some(shortcut.to_string());
    log::debug!("Registered area shortcut: {shortcut}");
    Ok(())
}
