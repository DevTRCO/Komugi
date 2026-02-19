export interface ShortcutEntry {
  keys: readonly string[]
  description: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: readonly ShortcutEntry[]
}

/**
 * Navigation shortcuts (fixed, not customizable).
 * Screenshot shortcuts are dynamic — loaded from preferences in ShortcutsPane and ShortcutOverlay.
 */
export const NAVIGATION_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ['Cmd', '1'], description: 'Toggle left sidebar' },
  { keys: ['Cmd', '2'], description: 'Toggle right sidebar' },
  { keys: ['Cmd', ','], description: 'Open preferences' },
  { keys: ['Cmd', '?'], description: 'Show keyboard shortcuts' },
] as const
