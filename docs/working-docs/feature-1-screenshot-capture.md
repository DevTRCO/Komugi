# Feature 1: Screenshot-Capture — Working Document

> **Status:** PLANNING
> **Branch:** `claude/setup-tauri-template-egQqh`
> **Erstellt:** 2026-02-18

---

## Ziel

Zwei Screenshot-Modi via Global Shortcuts. Screenshot als Base64 in Zustand Store.
Nach erfolgreichem Capture: Event emittieren fuer Feature 2 (Mini-Chat).

## Design-Entscheidungen

### Shortcuts (Phase 1)

| Modus              | Shortcut      | Begruendung                            |
| ------------------ | ------------- | -------------------------------------- |
| Fullscreen Capture | `Cmd+Shift+1` | Memorable, kollidiert nicht mit System |
| Area Selection     | `Cmd+Shift+2` | Paired mit Fullscreen-Shortcut         |

> `tauri-plugin-global-shortcut` unterstuetzt keine einzelnen Modifier-Keys.
> Double-Tap Option (⌥⌥) als optionales Enhancement spaeter.
> Shortcuts konfigurierbar via Preferences (gleicher Pattern wie Quick Pane).

### Screen Capture: `xcap` Crate

- Cross-platform (macOS, Windows, Linux)
- `Monitor::from_point(x, y)` fuer Cursor-Monitor
- `monitor.capture_image()` → `image::RgbaImage`
- `image` crate kommt transitiv mit — PNG-Encoding + Cropping

### Area Selection: Overlay Window

- Transparentes Fullscreen-Fenster (gleicher Multi-Window-Pattern wie Quick Pane)
- **Capture BEVOR Overlay geoeffnet wird** → Overlay erscheint nicht im Screenshot
- User zeichnet Rechteck → Koordinaten an Rust → Crop vom vorher gecapturten Bild
- ESC = Abbrechen

### Base64 Encoding

- PNG-komprimiert vor Base64 (1-4 MB fuer 1080p)
- `MAX_SCREENSHOT_BYTES = 10 MB` Limit
- Nur ein Screenshot gleichzeitig im Store (replace on capture)

### macOS Permissions

- `CGPreflightScreenCaptureAccess()` zum Pruefen
- `CGRequestScreenCaptureAccess()` zum Anfordern
- Bei Verweigerung: User-Meldung + Button zu System Settings (via `tauri-plugin-opener`)

## Datenfluss

```
Global Shortcut (Rust, Cmd+Shift+1/2)
  → Permission Check (macOS: CGPreflight)
    → xcap: Monitor.capture_image()
      → [Area: Overlay → User waehlt Region → Crop]
        → PNG encode → Base64
          → app.emit("screenshot-captured", ScreenshotResult)
            → Frontend: screenshotStore.setCurrentScreenshot()
              → [Feature 2: Mini-Chat reagiert auf Store-Aenderung]
```

## Dateien

### Rust (Neue Dateien)

#### `src-tauri/src/commands/screenshot.rs`

**Types:**

- `ScreenshotResult` — `{ image_base64, width, height, captured_at }`
- `ScreenshotError` — Tagged Enum: `PermissionDenied`, `NoMonitorFound`, `CaptureFailed`, `EncodingFailed`, `ImageTooLarge`

**Commands (6 total):**

1. `capture_fullscreen(app)` → `Result<ScreenshotResult, ScreenshotError>`
2. `check_screen_recording_permission()` → `bool`
3. `open_screen_recording_settings(app)` → `Result<(), String>`
4. `start_area_selection(app)` → `Result<(), ScreenshotError>`
5. `complete_area_selection(app, x, y, width, height)` → `Result<ScreenshotResult, ScreenshotError>`
6. `cancel_area_selection(app)` → `()`

**Helpers (nicht exposed):**

- `ensure_screen_recording_permission()` — Check + Request
- `capture_monitor_at_cursor(app)` → `(Monitor, RgbaImage)`
- `encode_image_to_base64(image)` → `ScreenshotResult`
- `store/take/clear_pending_capture()` — Static Mutex fuer Area-Selection-Flow
- `open/close_selection_overlay(app)` — Window Lifecycle
- `register_screenshot_shortcuts(app)` — Shortcut Registration (Pattern von quick_pane.rs)

### Rust (Modifikationen)

| Datei             | Aenderung                                                 |
| ----------------- | --------------------------------------------------------- |
| `Cargo.toml`      | `xcap`, `base64` Dependencies hinzufuegen                 |
| `commands/mod.rs` | `pub mod screenshot;` hinzufuegen                         |
| `bindings.rs`     | 6 Commands in `collect_commands!` registrieren            |
| `types.rs`        | Screenshot-Shortcut Defaults + `AppPreferences` erweitern |
| `lib.rs`          | `register_screenshot_shortcuts()` in `setup()` aufrufen   |

### Frontend (Neue Dateien)

| Datei                                                           | Zweck                                          |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `src/features/screenshot/stores/screenshotStore.ts`             | Zustand Store (devtools, selector-syntax)      |
| `src/features/screenshot/hooks/useScreenshotListener.ts`        | `listen("screenshot-captured")` → Store Update |
| `src/features/screenshot/hooks/useScreenshotCommands.ts`        | Typed command wrappers fuer UI                 |
| `src/features/screenshot/index.ts`                              | Barrel Export                                  |
| `screenshot-selection.html`                                     | Entry Point fuer Overlay Window                |
| `src/screenshot-selection-main.tsx`                             | React Mount fuer Overlay                       |
| `src/features/screenshot/components/ScreenshotSelectionApp.tsx` | Overlay UI (Crosshair + Rubber Band)           |

### Frontend (Modifikationen)

| Datei                                      | Aenderung                                           |
| ------------------------------------------ | --------------------------------------------------- |
| `vite.config.ts`                           | `screenshot-selection` Entry in rollupOptions.input |
| `src/hooks/useMainWindowEventListeners.ts` | `useScreenshotListener()` mounten                   |
| `src/lib/tauri-bindings.ts`                | Re-exports fuer neue Types                          |

### Config (Neue Dateien)

| Datei                                              | Zweck                            |
| -------------------------------------------------- | -------------------------------- |
| `src-tauri/capabilities/screenshot-selection.json` | Capabilities fuer Overlay Window |

### Locales

- Neue Keys in `locales/*.json` fuer Permission-Dialog + Error Messages

## Implementierungsreihenfolge

### Phase 1: Fullscreen Capture (MVP)

1. `Cargo.toml` — Dependencies hinzufuegen
2. `screenshot.rs` — Types, Permission-Check, `capture_fullscreen`, `encode_image_to_base64`
3. `screenshot.rs` — Shortcut Registration (`register_screenshot_shortcuts`)
4. `commands/mod.rs` + `bindings.rs` — Registrierung
5. `types.rs` — Shortcut Defaults + AppPreferences erweitern
6. `lib.rs` — Setup-Call
7. `screenshotStore.ts` — Zustand Store
8. `useScreenshotListener.ts` — Event Listener
9. `useMainWindowEventListeners.ts` — Listener mounten
10. `tauri-bindings.ts` — Re-exports
11. Bindings regenerieren + Compile Test

### Phase 2: Area Selection

1. `screenshot.rs` — `start_area_selection`, `complete_area_selection`, `cancel_area_selection`
2. `screenshot.rs` — `PENDING_CAPTURE` Mutex, Overlay Window Management
3. `screenshot-selection.html` + Entry Point
4. `vite.config.ts` — Neuer Entry
5. `ScreenshotSelectionApp.tsx` — Overlay UI
6. `capabilities/screenshot-selection.json`

### Phase 3: Polish

1. i18n Strings
2. Permission Dialog UX
3. Error Handling in UI (Toast bei Fehler)
4. Shortcut-Konfiguration in Preferences

## Risiken & Mitigations

| Risiko                                 | Mitigation                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `xcap` baut nicht auf allen Platforms  | macOS-First, andere spaeter                                                    |
| Scale Factor / DPI bei Area Selection  | Physical Pixels von xcap, Logical fuer Tauri Window — sorgfaeltig konvertieren |
| Overlay im Screenshot sichtbar         | Capture VOR Overlay-Oeffnung                                                   |
| Grosse Screenshots (5K, Multi-Monitor) | MAX_SCREENSHOT_BYTES Limit, PNG Compression, nur ein Monitor                   |
| macOS Permission einmalig              | Check vor jedem Capture, Custom Dialog bei Verweigerung                        |
| PENDING_CAPTURE haelt grosses Bild     | Sofort nach Crop droppen, Auto-Clear Timeout                                   |

## Fortschritt

- [ ] Phase 1: Fullscreen Capture
  - [ ] Cargo.toml Dependencies
  - [ ] screenshot.rs — Types + ScreenshotError
  - [ ] screenshot.rs — Permission Check (macOS FFI)
  - [ ] screenshot.rs — capture_fullscreen + encode_image_to_base64
  - [ ] screenshot.rs — Shortcut Registration
  - [ ] Registrierung: mod.rs, bindings.rs, types.rs, lib.rs
  - [ ] screenshotStore.ts (Zustand)
  - [ ] useScreenshotListener.ts
  - [ ] Wiring: useMainWindowEventListeners + tauri-bindings
  - [ ] Compile + Bindings Test
- [ ] Phase 2: Area Selection
  - [ ] PENDING_CAPTURE + Overlay Window Management
  - [ ] Area Selection Commands (start/complete/cancel)
  - [ ] screenshot-selection.html + Entry Point
  - [ ] ScreenshotSelectionApp.tsx (Overlay UI)
  - [ ] vite.config.ts + capabilities
- [ ] Phase 3: Polish
  - [ ] i18n Strings
  - [ ] Permission Dialog UX
  - [ ] Error Toasts
