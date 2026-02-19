import { useQuery } from '@tanstack/react-query'
import { useUIStore } from '@/store/ui-store'
import { NAVIGATION_SHORTCUTS } from '@/lib/constants/shortcuts'
import { usePreferences } from '@/services/preferences'
import { commands } from '@/lib/tauri-bindings'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Parses a Tauri shortcut string into display keys.
 * e.g. "CommandOrControl+Shift+9" → ["Cmd", "Shift", "9"]
 */
function parseShortcutToKeys(shortcut: string): readonly string[] {
  return shortcut.split('+').map(part => {
    if (part === 'CommandOrControl') return 'Cmd'
    return part
  })
}

export function ShortcutOverlay() {
  const open = useUIStore(state => state.shortcutOverlayOpen)
  const setOpen = useUIStore(state => state.setShortcutOverlayOpen)

  const { data: preferences } = usePreferences()
  const { data: defaults } = useQuery({
    queryKey: ['default-screenshot-shortcuts'],
    queryFn: () => commands.getDefaultScreenshotShortcuts(),
    staleTime: Infinity,
  })

  // F3 fix: fall back to defaults, then to hardcoded last resort
  const fullscreenShortcut =
    preferences?.fullscreen_screenshot_shortcut ??
    defaults?.fullscreen ??
    'CommandOrControl+Shift+9'
  const areaShortcut =
    preferences?.area_screenshot_shortcut ??
    defaults?.area ??
    'CommandOrControl+Shift+0'
  const windowShortcut =
    preferences?.window_screenshot_shortcut ??
    defaults?.window ??
    'CommandOrControl+Shift+8'

  const screenshotShortcuts = [
    {
      keys: parseShortcutToKeys(fullscreenShortcut),
      description: 'Fullscreen screenshot',
    },
    {
      keys: parseShortcutToKeys(areaShortcut),
      description: 'Area selection screenshot',
    },
    {
      keys: parseShortcutToKeys(windowShortcut),
      description: 'Window selection screenshot',
    },
  ]

  const groups = [
    { title: 'Screenshots', shortcuts: screenshotShortcuts },
    { title: 'Navigation', shortcuts: NAVIGATION_SHORTCUTS },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md font-sans rounded-xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick reference for all available shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {groups.map(group => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map(shortcut => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, idx) => (
                        <kbd
                          key={`${shortcut.description}-${idx}`}
                          className="min-w-[1.5rem] rounded border border-border bg-muted px-1.5 py-0.5 text-center text-xs text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
