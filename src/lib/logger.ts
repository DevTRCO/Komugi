/**
 * Logging utility backed by @tauri-apps/plugin-log.
 *
 * In Tauri: routes to Stdout + LogDir + WebView console (via plugin targets).
 * Outside Tauri (vitest/jsdom): falls back to console.* for dev visibility.
 */

import { isTauri } from '@tauri-apps/api/core'
import {
  trace as pTrace,
  debug as pDebug,
  info as pInfo,
  warn as pWarn,
  error as pError,
} from '@tauri-apps/plugin-log'

type LogFn = (message: string) => Promise<void>
type ConsoleFn = (...args: unknown[]) => void

function formatMessage(
  message: string,
  context?: Record<string, unknown>
): string {
  if (!context) return message
  return `${message} | ${JSON.stringify(context)}`
}

function swallow(_: unknown): void {
  // fire-and-forget: plugin failure must not crash the caller
}

function makeLogger(pluginFn: LogFn, consoleFn: ConsoleFn) {
  return (message: string, context?: Record<string, unknown>): void => {
    if (isTauri()) {
      pluginFn(formatMessage(message, context)).catch(swallow)
    } else {
      const args: unknown[] = context ? [message, context] : [message]
      consoleFn(...args)
    }
  }
}

export const logger = {
  trace: makeLogger(pTrace, console.debug),
  debug: makeLogger(pDebug, console.debug),
  info: makeLogger(pInfo, console.info),
  warn: makeLogger(pWarn, console.warn),
  error: makeLogger(pError, console.error),
}
