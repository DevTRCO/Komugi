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
use tauri::{AppHandle, Emitter, Manager};

use crate::types::{
    ScreenshotShortcutDefaults, ScreenshotShortcutKind, WindowBounds, DEFAULT_AREA_SHORTCUT,
    DEFAULT_FULLSCREEN_SHORTCUT, DEFAULT_WINDOW_SELECT_SHORTCUT,
};

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

/// Maximum longest edge for screenshots (Gemini's optimal resolution).
const MAX_SCREENSHOT_EDGE: u32 = 1568;

/// Resizes image if longest edge exceeds MAX_SCREENSHOT_EDGE, maintaining aspect ratio.
fn maybe_resize(image: &image::RgbaImage) -> std::borrow::Cow<'_, image::RgbaImage> {
    let w = image.width();
    let h = image.height();
    let longest = w.max(h);

    if longest <= MAX_SCREENSHOT_EDGE {
        return std::borrow::Cow::Borrowed(image);
    }

    let scale = MAX_SCREENSHOT_EDGE as f64 / longest as f64;
    let new_w = (w as f64 * scale).round() as u32;
    let new_h = (h as f64 * scale).round() as u32;

    log::info!("Resizing screenshot from {w}x{h} to {new_w}x{new_h}");
    let resized =
        image::imageops::resize(image, new_w, new_h, image::imageops::FilterType::Lanczos3);
    std::borrow::Cow::Owned(resized)
}

/// Encodes an RgbaImage to base64 PNG and wraps it in a ScreenshotResult.
/// Automatically resizes to max 1568px longest edge for optimal Gemini API usage and storage.
fn encode_image_to_base64(image: &image::RgbaImage) -> Result<ScreenshotResult, ScreenshotError> {
    let image = maybe_resize(image);

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
/// Returns both the image and monitor geometry for consistent positioning.
/// Falls back to the primary monitor if cursor-based lookup fails.
#[cfg(target_os = "macos")]
fn capture_monitor_at_cursor(
    app: &AppHandle,
) -> Result<(image::RgbaImage, MonitorInfo), ScreenshotError> {
    let monitor = match app.cursor_position() {
        Ok(cursor_pos) => {
            log::debug!("Cursor at ({}, {})", cursor_pos.x, cursor_pos.y);
            xcap::Monitor::from_point(cursor_pos.x as i32, cursor_pos.y as i32)
                .inspect_err(|e| {
                    log::warn!("from_point failed ({e}), falling back to primary monitor");
                })
                .ok()
        }
        Err(e) => {
            log::warn!("Failed to get cursor position ({e}), using primary monitor");
            None
        }
    };

    let monitor = match monitor {
        Some(m) => m,
        None => {
            let monitors = xcap::Monitor::all().map_err(|e| ScreenshotError::CaptureFailed {
                message: format!("Failed to list monitors: {e}"),
            })?;
            monitors
                .into_iter()
                .next()
                .ok_or(ScreenshotError::NoMonitorFound)?
        }
    };

    let map_monitor_err = |e: xcap::XCapError| ScreenshotError::CaptureFailed {
        message: format!("Failed to read monitor info: {e}"),
    };

    let info = MonitorInfo {
        x: monitor.x().map_err(map_monitor_err)?,
        y: monitor.y().map_err(map_monitor_err)?,
        width: monitor.width().map_err(map_monitor_err)?,
        height: monitor.height().map_err(map_monitor_err)?,
        scale_factor: monitor.scale_factor().map_err(map_monitor_err)? as f64,
    };

    log::debug!(
        "Capturing monitor: {}x{} at ({}, {}) scale={}",
        info.width,
        info.height,
        info.x,
        info.y,
        info.scale_factor
    );

    let image = monitor
        .capture_image()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Screen capture failed: {e}"),
        })?;

    Ok((image, info))
}

#[cfg(not(target_os = "macos"))]
fn capture_monitor_at_cursor(
    _app: &AppHandle,
) -> Result<(image::RgbaImage, MonitorInfo), ScreenshotError> {
    Err(ScreenshotError::NotSupported {
        message: "Screen capture is currently only supported on macOS".to_string(),
    })
}

// ============================================================================
// Pending Capture Storage (for area selection flow)
// ============================================================================

/// Monitor geometry captured at the same instant as the screenshot.
#[derive(Debug, Clone)]
struct MonitorInfo {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

/// Holds both the captured image and the monitor it came from.
#[allow(dead_code)]
struct PendingCapture {
    image: image::RgbaImage,
    monitor: MonitorInfo,
}

/// Holds the captured image while the user draws the selection rectangle.
static PENDING_CAPTURE: Mutex<Option<PendingCapture>> = Mutex::new(None);

fn store_pending_capture(capture: PendingCapture) -> Result<(), ScreenshotError> {
    let mut pending = PENDING_CAPTURE
        .lock()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to lock pending capture: {e}"),
        })?;
    *pending = Some(capture);
    Ok(())
}

fn take_pending_capture() -> Result<PendingCapture, ScreenshotError> {
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
// Pending Window Bounds Storage (for window selection flow)
// ============================================================================

/// Holds enumerated window bounds while the user picks a window.
static PENDING_WINDOWS: Mutex<Option<Vec<WindowBounds>>> = Mutex::new(None);

fn store_pending_windows(bounds: Vec<WindowBounds>) -> Result<(), ScreenshotError> {
    let mut pending = PENDING_WINDOWS
        .lock()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to lock pending windows: {e}"),
        })?;
    *pending = Some(bounds);
    Ok(())
}

fn clear_pending_windows() {
    if let Ok(mut pending) = PENDING_WINDOWS.lock() {
        *pending = None;
    }
}

// ============================================================================
// Window Enumeration (macOS only — Core Graphics FFI)
// ============================================================================

/// Enumerates visible on-screen windows and returns their bounds relative to the given monitor.
#[cfg(target_os = "macos")]
fn enumerate_windows(monitor: &MonitorInfo) -> Result<Vec<WindowBounds>, ScreenshotError> {
    use core_foundation::array::CFArray;
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;

    // Core Graphics FFI
    type CFArrayRef = *const std::ffi::c_void;
    type CFDictionaryRef = *const std::ffi::c_void;
    type CGRect = core_graphics::geometry::CGRect;

    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFArrayRef;
        fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect)
            -> bool;
    }

    // kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
    const OPTIONS: u32 = (1 << 0) | (1 << 4);
    const NULL_WINDOW: u32 = 0; // kCGNullWindowID

    let cf_array_ref = unsafe { CGWindowListCopyWindowInfo(OPTIONS, NULL_WINDOW) };
    if cf_array_ref.is_null() {
        return Err(ScreenshotError::CaptureFailed {
            message: "CGWindowListCopyWindowInfo returned null".to_string(),
        });
    }

    // Safety: we own the returned CFArray (Create Rule), so wrap for auto-release
    let window_list: CFArray<CFType> =
        unsafe { TCFType::wrap_under_create_rule(cf_array_ref as _) };

    let our_pid = std::process::id();
    let mut result = Vec::new();
    let mon_x = monitor.x as f64;
    let mon_y = monitor.y as f64;

    let key_bounds = CFString::new("kCGWindowBounds");
    let key_owner = CFString::new("kCGWindowOwnerName");
    let key_name = CFString::new("kCGWindowName");
    let key_layer = CFString::new("kCGWindowLayer");
    let key_pid = CFString::new("kCGWindowOwnerPID");

    for i in 0..window_list.len() {
        // Each element is a CFDictionary
        let dict_ref = unsafe { window_list.get_unchecked(i) };
        let dict: CFDictionary<CFString, CFType> =
            unsafe { TCFType::wrap_under_get_rule(dict_ref.as_CFTypeRef() as _) };

        // Skip non-normal layers (menubar, dock, etc.)
        let layer = dict
            .find(&key_layer)
            .and_then(|v| unsafe {
                let n: CFNumber = TCFType::wrap_under_get_rule(v.as_CFTypeRef() as _);
                n.to_i32()
            })
            .unwrap_or(-1);
        if layer != 0 {
            continue;
        }

        // Skip our own process windows (the overlay itself)
        let pid = dict
            .find(&key_pid)
            .and_then(|v| unsafe {
                let n: CFNumber = TCFType::wrap_under_get_rule(v.as_CFTypeRef() as _);
                n.to_i32()
            })
            .unwrap_or(-1);
        if pid >= 0 && pid as u32 == our_pid {
            continue;
        }

        // Read bounds dictionary → CGRect
        let bounds_dict = match dict.find(&key_bounds) {
            Some(v) => v.as_CFTypeRef(),
            None => continue,
        };

        let mut rect = core_graphics::geometry::CGRect::new(
            &core_graphics::geometry::CGPoint::new(0.0, 0.0),
            &core_graphics::geometry::CGSize::new(0.0, 0.0),
        );
        let ok = unsafe { CGRectMakeWithDictionaryRepresentation(bounds_dict as _, &mut rect) };
        if !ok {
            continue;
        }

        // Skip zero-sized windows
        if rect.size.width < 1.0 || rect.size.height < 1.0 {
            continue;
        }

        // Read owner name and window name
        let owner_name = dict
            .find(&key_owner)
            .map(|v| unsafe {
                let s: CFString = TCFType::wrap_under_get_rule(v.as_CFTypeRef() as _);
                s.to_string()
            })
            .unwrap_or_default();

        let window_name = dict
            .find(&key_name)
            .map(|v| unsafe {
                let s: CFString = TCFType::wrap_under_get_rule(v.as_CFTypeRef() as _);
                s.to_string()
            })
            .unwrap_or_default();

        // Subtract monitor origin so coordinates are overlay-relative
        result.push(WindowBounds {
            x: rect.origin.x - mon_x,
            y: rect.origin.y - mon_y,
            width: rect.size.width,
            height: rect.size.height,
            owner_name,
            window_name,
        });
    }

    log::info!("Enumerated {} windows on monitor", result.len());
    Ok(result)
}

#[cfg(not(target_os = "macos"))]
fn enumerate_windows(_monitor: &MonitorInfo) -> Result<Vec<WindowBounds>, ScreenshotError> {
    Err(ScreenshotError::NotSupported {
        message: "Window enumeration is only supported on macOS".to_string(),
    })
}

// ============================================================================
// Selection Overlay Window
// ============================================================================

fn open_selection_overlay(
    app: &AppHandle,
    monitor: &MonitorInfo,
    mode: &str,
) -> Result<(), ScreenshotError> {
    use tauri::webview::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let scale = monitor.scale_factor;

    // Close existing overlay if any
    close_selection_overlay(app);

    // Pass scale factor and mode as URL query params so the frontend knows
    // the captured monitor's scale and which selection mode to render.
    let url_path = format!("screenshot-selection.html?scale={scale}&mode={mode}");

    WebviewWindowBuilder::new(app, AREA_SELECTION_LABEL, WebviewUrl::App(url_path.into()))
        .title("")
        .position(monitor.x as f64 / scale, monitor.y as f64 / scale)
        .inner_size(monitor.width as f64 / scale, monitor.height as f64 / scale)
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

    log::info!(
        "Selection overlay opened on monitor at ({}, {})",
        monitor.x,
        monitor.y
    );
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

    let (image, _monitor_info) = capture_monitor_at_cursor(&app)?;
    let result = encode_image_to_base64(&image)?;

    let _ = app.emit("screenshot-captured", &result);
    show_main_window(&app);

    Ok(result)
}

/// Shows and focuses the main window (called after screenshot capture).
/// Defensive: logs errors instead of ignoring them, never panics.
fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("Main window not found, cannot show after screenshot");
        return;
    };

    if let Err(e) = window.show() {
        log::error!("Failed to show main window: {e}");
        return;
    }

    if let Err(e) = window.set_focus() {
        log::warn!("Failed to focus main window: {e}");
    }
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

    // Capture BEFORE opening overlay so the overlay is not in the screenshot.
    // Store monitor info alongside image to avoid re-querying cursor position.
    let (image, monitor_info) = capture_monitor_at_cursor(&app)?;
    let pending = PendingCapture {
        image,
        monitor: monitor_info.clone(),
    };
    store_pending_capture(pending)?;

    open_selection_overlay(&app, &monitor_info, "area")?;

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

    let pending = take_pending_capture()?;
    let image = pending.image;

    // Clamp to image bounds
    let img_w = image.width();
    let img_h = image.height();

    if x + width > img_w || y + height > img_h {
        log::warn!(
            "Selection exceeds image dimensions: selection ({x}, {y}) {}x{} > image {img_w}x{img_h}",
            width, height
        );
    }
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
    clear_pending_windows();
    let _ = app.emit("screenshot-captured", &result);
    show_main_window(&app);

    Ok(result)
}

/// Checks whether Accessibility permission is granted (needed for global shortcuts).
#[tauri::command]
#[specta::specta]
pub fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        unsafe { AXIsProcessTrusted() }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Opens the macOS Accessibility settings pane.
#[tauri::command]
#[specta::specta]
pub async fn open_accessibility_settings(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
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

/// Cancels the area selection and closes the overlay.
#[tauri::command]
#[specta::specta]
pub fn cancel_area_selection(app: AppHandle) {
    log::info!("Area selection cancelled");
    clear_pending_capture();
    clear_pending_windows();
    close_selection_overlay(&app);
}

/// Starts window selection: captures screen, enumerates windows, opens overlay in window mode.
#[tauri::command]
#[specta::specta]
pub async fn start_window_selection(app: AppHandle) -> Result<(), ScreenshotError> {
    log::info!("Starting window selection for screenshot");

    ensure_screen_recording_permission()?;

    // Capture BEFORE opening overlay so the overlay is not in the screenshot.
    let (image, monitor_info) = capture_monitor_at_cursor(&app)?;

    // Enumerate windows BEFORE opening overlay so the overlay doesn't appear in the list.
    let windows = enumerate_windows(&monitor_info)?;
    store_pending_windows(windows)?;

    let pending = PendingCapture {
        image,
        monitor: monitor_info.clone(),
    };
    store_pending_capture(pending)?;

    open_selection_overlay(&app, &monitor_info, "window")?;

    Ok(())
}

/// Returns the pending window bounds for the overlay to render.
/// Called by the frontend overlay on mount (window mode).
#[tauri::command]
#[specta::specta]
pub fn get_pending_window_bounds() -> Result<Vec<WindowBounds>, ScreenshotError> {
    let pending = PENDING_WINDOWS
        .lock()
        .map_err(|e| ScreenshotError::CaptureFailed {
            message: format!("Failed to lock pending windows: {e}"),
        })?;
    pending.clone().ok_or(ScreenshotError::CaptureFailed {
        message: "No pending window bounds found".to_string(),
    })
}

// ============================================================================
// Shortcut Registration
// ============================================================================

/// Tracks currently registered screenshot shortcuts for selective unregistration.
static CURRENT_FULLSCREEN_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_AREA_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_WINDOW_SELECT_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// Registers all screenshot global shortcuts. Called from setup().
/// Accepts optional custom shortcuts; falls back to defaults when None.
#[cfg(desktop)]
pub fn register_screenshot_shortcuts(
    app: &AppHandle,
    fullscreen: Option<&str>,
    area: Option<&str>,
    window: Option<&str>,
) -> Result<(), String> {
    register_shortcut(
        app,
        fullscreen.unwrap_or(DEFAULT_FULLSCREEN_SHORTCUT),
        &CURRENT_FULLSCREEN_SHORTCUT,
        "Fullscreen screenshot",
        |handle| {
            tauri::async_runtime::spawn(async move {
                match capture_fullscreen(handle).await {
                    Ok(r) => log::info!("Screenshot captured: {}x{}", r.width, r.height),
                    Err(e) => log::error!("Screenshot capture failed: {e}"),
                }
            });
        },
    )?;
    register_shortcut(
        app,
        area.unwrap_or(DEFAULT_AREA_SHORTCUT),
        &CURRENT_AREA_SHORTCUT,
        "Area selection",
        |handle| {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_area_selection(handle).await {
                    log::error!("Area selection failed: {e}");
                }
            });
        },
    )?;
    register_shortcut(
        app,
        window.unwrap_or(DEFAULT_WINDOW_SELECT_SHORTCUT),
        &CURRENT_WINDOW_SELECT_SHORTCUT,
        "Window selection",
        |handle| {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_window_selection(handle).await {
                    log::error!("Window selection failed: {e}");
                }
            });
        },
    )?;
    log::info!("Screenshot shortcuts registered");
    Ok(())
}

/// Returns the default screenshot shortcuts for frontend display.
#[tauri::command]
#[specta::specta]
pub fn get_default_screenshot_shortcuts() -> ScreenshotShortcutDefaults {
    ScreenshotShortcutDefaults {
        fullscreen: DEFAULT_FULLSCREEN_SHORTCUT.to_string(),
        area: DEFAULT_AREA_SHORTCUT.to_string(),
        window: DEFAULT_WINDOW_SELECT_SHORTCUT.to_string(),
    }
}

/// Updates a single screenshot shortcut. Pass None to reset to default.
/// Each kind has its own inline closure matching the register_screenshot_shortcuts pattern (F1 fix).
#[tauri::command]
#[specta::specta]
pub fn update_screenshot_shortcut(
    app: AppHandle,
    kind: ScreenshotShortcutKind,
    shortcut: Option<String>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        match kind {
            ScreenshotShortcutKind::Fullscreen => {
                let sc = shortcut.as_deref().unwrap_or(DEFAULT_FULLSCREEN_SHORTCUT);
                log::info!("Updating fullscreen screenshot shortcut to: {sc}");
                register_shortcut(
                    &app,
                    sc,
                    &CURRENT_FULLSCREEN_SHORTCUT,
                    "Fullscreen screenshot",
                    |handle| {
                        tauri::async_runtime::spawn(async move {
                            match capture_fullscreen(handle).await {
                                Ok(r) => {
                                    log::info!("Screenshot captured: {}x{}", r.width, r.height)
                                }
                                Err(e) => log::error!("Screenshot capture failed: {e}"),
                            }
                        });
                    },
                )
            }
            ScreenshotShortcutKind::Area => {
                let sc = shortcut.as_deref().unwrap_or(DEFAULT_AREA_SHORTCUT);
                log::info!("Updating area screenshot shortcut to: {sc}");
                register_shortcut(
                    &app,
                    sc,
                    &CURRENT_AREA_SHORTCUT,
                    "Area selection",
                    |handle| {
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = start_area_selection(handle).await {
                                log::error!("Area selection failed: {e}");
                            }
                        });
                    },
                )
            }
            ScreenshotShortcutKind::Window => {
                let sc = shortcut
                    .as_deref()
                    .unwrap_or(DEFAULT_WINDOW_SELECT_SHORTCUT);
                log::info!("Updating window screenshot shortcut to: {sc}");
                register_shortcut(
                    &app,
                    sc,
                    &CURRENT_WINDOW_SELECT_SHORTCUT,
                    "Window selection",
                    |handle| {
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = start_window_selection(handle).await {
                                log::error!("Window selection failed: {e}");
                            }
                        });
                    },
                )
            }
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, kind, shortcut);
        log::warn!("Global shortcuts not supported on this platform");
        Ok(())
    }
}

/// Generic shortcut registration: unregisters old shortcut, registers new one with callback.
#[cfg(desktop)]
fn register_shortcut<F>(
    app: &AppHandle,
    shortcut: &str,
    current_shortcut: &Mutex<Option<String>>,
    label: &str,
    on_pressed: F,
) -> Result<(), String>
where
    F: Fn(AppHandle) + Send + Sync + 'static,
{
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let global_shortcut = app.global_shortcut();

    let mut current = current_shortcut
        .lock()
        .map_err(|e| format!("Failed to lock mutex: {e}"))?;

    if let Some(old) = current.take() {
        if let Ok(parsed) = old.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(parsed);
        }
    }

    let app_handle = app.clone();
    let label_owned = label.to_string();
    global_shortcut
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                log::info!("{label_owned} shortcut triggered");
                on_pressed(app_handle.clone());
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{shortcut}': {e}"))?;

    *current = Some(shortcut.to_string());
    log::debug!("Registered {label} shortcut: {shortcut}");
    Ok(())
}
