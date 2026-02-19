import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface ZoomedScreenshotSource {
  sessionId: string
  messageId?: string
}

interface UIState {
  leftSidebarVisible: boolean
  rightSidebarVisible: boolean
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  shortcutOverlayOpen: boolean
  lastQuickPaneEntry: string | null
  zoomedScreenshotSource: ZoomedScreenshotSource | null

  toggleLeftSidebar: () => void
  setLeftSidebarVisible: (visible: boolean) => void
  toggleRightSidebar: () => void
  setRightSidebarVisible: (visible: boolean) => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  togglePreferences: () => void
  setPreferencesOpen: (open: boolean) => void
  setShortcutOverlayOpen: (open: boolean) => void
  setLastQuickPaneEntry: (text: string) => void
  openScreenshotZoom: (source: ZoomedScreenshotSource) => void
  closeScreenshotZoom: () => void
}

export const useUIStore = create<UIState>()(
  devtools(
    set => ({
      leftSidebarVisible: true,
      rightSidebarVisible: false,
      commandPaletteOpen: false,
      preferencesOpen: false,
      shortcutOverlayOpen: false,
      lastQuickPaneEntry: null,
      zoomedScreenshotSource: null,

      toggleLeftSidebar: () =>
        set(
          state => ({ leftSidebarVisible: !state.leftSidebarVisible }),
          undefined,
          'toggleLeftSidebar'
        ),

      setLeftSidebarVisible: visible =>
        set(
          { leftSidebarVisible: visible },
          undefined,
          'setLeftSidebarVisible'
        ),

      toggleRightSidebar: () =>
        set(
          state => ({ rightSidebarVisible: !state.rightSidebarVisible }),
          undefined,
          'toggleRightSidebar'
        ),

      setRightSidebarVisible: visible =>
        set(
          { rightSidebarVisible: visible },
          undefined,
          'setRightSidebarVisible'
        ),

      toggleCommandPalette: () =>
        set(
          state => ({ commandPaletteOpen: !state.commandPaletteOpen }),
          undefined,
          'toggleCommandPalette'
        ),

      setCommandPaletteOpen: open =>
        set({ commandPaletteOpen: open }, undefined, 'setCommandPaletteOpen'),

      togglePreferences: () =>
        set(
          state => ({ preferencesOpen: !state.preferencesOpen }),
          undefined,
          'togglePreferences'
        ),

      setPreferencesOpen: open =>
        set({ preferencesOpen: open }, undefined, 'setPreferencesOpen'),

      setShortcutOverlayOpen: open =>
        set({ shortcutOverlayOpen: open }, undefined, 'setShortcutOverlayOpen'),

      setLastQuickPaneEntry: text =>
        set({ lastQuickPaneEntry: text }, undefined, 'setLastQuickPaneEntry'),

      openScreenshotZoom: source =>
        set(
          { zoomedScreenshotSource: source, rightSidebarVisible: true },
          undefined,
          'openScreenshotZoom'
        ),

      closeScreenshotZoom: () =>
        set({ zoomedScreenshotSource: null }, undefined, 'closeScreenshotZoom'),
    }),
    {
      name: 'ui-store',
    }
  )
)
