export interface ShortcutEntry {
  keys: readonly string[]
  description: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: readonly ShortcutEntry[]
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Screenshots',
    shortcuts: [
      { keys: ['Cmd', 'Shift', '9'], description: 'Fullscreen screenshot' },
      {
        keys: ['Cmd', 'Shift', '0'],
        description: 'Area selection screenshot',
      },
      {
        keys: ['Cmd', 'Shift', '8'],
        description: 'Window selection screenshot',
      },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Cmd', '1'], description: 'Toggle left sidebar' },
      { keys: ['Cmd', '2'], description: 'Toggle right sidebar' },
      { keys: ['Cmd', ','], description: 'Open preferences' },
      { keys: ['Cmd', '?'], description: 'Show keyboard shortcuts' },
    ],
  },
] as const
