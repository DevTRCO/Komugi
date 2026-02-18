import { useUIStore } from '@/store/ui-store'
import { SHORTCUT_GROUPS } from '@/lib/constants/shortcuts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ShortcutOverlay() {
  const open = useUIStore(state => state.shortcutOverlayOpen)
  const setOpen = useUIStore(state => state.setShortcutOverlayOpen)

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
          {SHORTCUT_GROUPS.map(group => (
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
