/**
 * Re-export generated Tauri bindings with project conventions
 *
 * This file provides type-safe access to all Tauri commands.
 * Types are auto-generated from Rust by tauri-specta.
 *
 * @example
 * ```typescript
 * import { commands } from '@/lib/tauri-bindings'
 *
 * // In event handlers - explicit error handling
 * const result = await commands.savePreferences(prefs)
 * if (result.status === 'error') {
 *   toast.error(result.error)
 * }
 * ```
 *
 * @see docs/developer/tauri-commands.md for full documentation
 */

export { commands, type Result } from './bindings'
export type {
  AppPreferences,
  FetchedUrlContent,
  JsonValue,
  LearningProfile,
  LearningProfileEntry,
  LearningProfileError,
  RecoveryError,
  ScreenshotError,
  ScreenshotResult,
  ScreenshotShortcutDefaults,
  ScreenshotShortcutKind,
  HistoryError,
  StoredSession,
  StoredSessionSummary,
  StoredMessage,
  UrlFetchError,
  WindowBounds,
} from './bindings'
