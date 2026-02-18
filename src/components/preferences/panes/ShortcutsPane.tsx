import { SHORTCUT_GROUPS } from '@/lib/constants/shortcuts'

export function ShortcutsPane() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
        <p className="text-sm text-muted-foreground">
          All available keyboard shortcuts in Komugi.
        </p>
      </div>

      {SHORTCUT_GROUPS.map(group => (
        <div key={group.title}>
          <h4 className="mb-3 text-sm font-medium text-foreground">
            {group.title}
          </h4>
          <div className="rounded-lg border border-border">
            {group.shortcuts.map((shortcut, i) => (
              <div
                key={shortcut.description}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < group.shortcuts.length - 1 ? 'border-b border-border' : ''
                }`}
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
  )
}
