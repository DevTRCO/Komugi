# Cleanup: Dead Code Removal & Knip Configuration

## Context

Static analysis (knip, jscpd) identified 7 dead exports, 1 knip config gap, and 1 Rust duplication worth addressing. All quality gates pass — this is housekeeping, not bug fixing.

## Priority: Low

No functional impact. Clean up at convenience.

---

## Part 1: Remove Dead Exports (7 items)

### 1.1 Remove redundant default export from CommandPalette

- **File:** `src/components/command-palette/CommandPalette.tsx:123`
- **Action:** Remove `export default CommandPalette` — all consumers use the named export

### 1.2 Remove unused `unwrapResult` function

- **File:** `src/lib/tauri-bindings.ts:40`
- **Action:** Remove function definition. Also remove its mock in `src/test/setup.ts`
- **Why:** Codebase consistently uses `result.status === 'ok'` pattern instead

### 1.3 Remove unused `loadEmergencyData` function

- **File:** `src/lib/recovery.ts:90`
- **Action:** Remove function. Also remove its mock in `src/test/setup.ts`
- **Why:** `saveEmergencyData` and `cleanupOldFiles` are used, but `loadEmergencyData` is not

### 1.4 Remove unused logger convenience exports

- **File:** `src/lib/logger.ts:127`
- **Action:** Remove `export const { trace, debug, info, warn, error } = logger`
- **Why:** All 22+ consumers import `{ logger }` and call `logger.debug()` etc.

### 1.5 Remove unused notification convenience exports

- **File:** `src/lib/notifications.ts:111`
- **Action:** Remove `export const { success, error, info, warning } = notifications`
- **Why:** All consumers import `{ notify }` or `{ notifications }`

### 1.6 Remove unused `CommandGroup` interface

- **File:** `src/lib/commands/types.ts:17`
- **Action:** Remove the `CommandGroup` interface definition
- **Why:** `CommandPalette.tsx` imports `CommandGroup` from `cmdk`, not from this file

### 1.7 Remove unused `SessionSummary` type alias

- **File:** `src/features/history/stores/historyStore.ts:8`
- **Action:** Remove type alias and its re-export from `src/features/history/index.ts:2`
- **Why:** All code uses `StoredSessionSummary` from `@/lib/tauri-bindings` directly

---

## Part 2: Fix Knip Configuration

- **File:** `knip.json`

### 2.1 Add multi-window entry points

Add to `entry` array:

- `src/quick-pane-main.tsx`
- `src/screenshot-selection-main.tsx`

These are Vite rollup entry points for Tauri multi-window HTML files. Knip doesn't follow HTML entries.

### 2.2 Add CSS-only dependencies to ignoreDependencies

Add to `ignoreDependencies`:

- `@tailwindcss/typography` (used via `@plugin` in App.css)
- `katex` (CSS imported via `@import` in App.css, also peer dep of rehype-katex)

---

## Part 3: Rust Duplication (Optional)

### 3.1 Extract generic shortcut registration helper

- **File:** `src-tauri/src/commands/screenshot.rs:562-631`
- **What:** `register_fullscreen_shortcut` and `register_area_shortcut` are nearly identical (~60 lines). Only differ in: mutex variable, log message, callback body.
- **Action:** Extract a `register_shortcut` helper accepting mutex ref, shortcut string, label, and callback closure. Reduces to ~35 lines.
- **Risk:** Low. Internal helper, no API change.

---

## Verification

After all changes:

1. `npm run check:all` — must pass
2. `npx knip` — should show zero findings for the items above
3. `npm run test:run` — 47 tests pass (update mocks in setup.ts)
