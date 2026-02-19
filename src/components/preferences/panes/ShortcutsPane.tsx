import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShortcutPicker } from '../ShortcutPicker'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { commands } from '@/lib/tauri-bindings'
import type { ScreenshotShortcutKind } from '@/lib/tauri-bindings'
import { NAVIGATION_SHORTCUTS } from '@/lib/constants/shortcuts'
import { logger } from '@/lib/logger'

export function ShortcutsPane() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  const { data: defaults } = useQuery({
    queryKey: ['default-screenshot-shortcuts'],
    queryFn: () => commands.getDefaultScreenshotShortcuts(),
    staleTime: Infinity,
  })

  const handleScreenshotShortcutChange = async (
    kind: ScreenshotShortcutKind,
    prefKey:
      | 'fullscreen_screenshot_shortcut'
      | 'area_screenshot_shortcut'
      | 'window_screenshot_shortcut',
    newShortcut: string | null
  ) => {
    if (!preferences) return

    const oldShortcut = preferences[prefKey]

    logger.info('Updating screenshot shortcut', {
      kind,
      oldShortcut,
      newShortcut,
    })

    const result = await commands.updateScreenshotShortcut(kind, newShortcut)

    if (result.status === 'error') {
      logger.error('Failed to register screenshot shortcut', {
        error: result.error,
      })
      toast.error(t('toast.error.shortcutFailed'), {
        description: result.error,
      })
      return
    }

    try {
      await savePreferences.mutateAsync({
        ...preferences,
        [prefKey]: newShortcut,
      })
    } catch {
      logger.warn('Save failed, rolling back screenshot shortcut', {
        kind,
        oldShortcut,
        newShortcut,
      })

      const rollbackResult = await commands.updateScreenshotShortcut(
        kind,
        oldShortcut
      )

      if (rollbackResult.status === 'error') {
        logger.error(
          'Rollback failed - backend and preferences are out of sync',
          {
            error: rollbackResult.error,
            kind,
            attemptedShortcut: newShortcut,
            originalShortcut: oldShortcut,
          }
        )
        toast.error(t('toast.error.shortcutRestoreFailed'), {
          description: t('toast.error.shortcutRestoreDescription'),
        })
      }
    }
  }

  const isDisabled = !preferences || savePreferences.isPending

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('preferences.shortcuts')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('preferences.shortcuts.description')}
        </p>
      </div>

      <SettingsSection title={t('preferences.shortcuts.screenshotTitle')}>
        <SettingsField
          label={t('preferences.shortcuts.fullscreen')}
          description={t('preferences.shortcuts.fullscreenDescription')}
        >
          <ShortcutPicker
            value={preferences?.fullscreen_screenshot_shortcut ?? null}
            defaultValue={defaults?.fullscreen ?? 'CommandOrControl+Shift+9'}
            onChange={shortcut =>
              handleScreenshotShortcutChange(
                'Fullscreen',
                'fullscreen_screenshot_shortcut',
                shortcut
              )
            }
            disabled={isDisabled}
          />
        </SettingsField>

        <SettingsField
          label={t('preferences.shortcuts.area')}
          description={t('preferences.shortcuts.areaDescription')}
        >
          <ShortcutPicker
            value={preferences?.area_screenshot_shortcut ?? null}
            defaultValue={defaults?.area ?? 'CommandOrControl+Shift+0'}
            onChange={shortcut =>
              handleScreenshotShortcutChange(
                'Area',
                'area_screenshot_shortcut',
                shortcut
              )
            }
            disabled={isDisabled}
          />
        </SettingsField>

        <SettingsField
          label={t('preferences.shortcuts.window')}
          description={t('preferences.shortcuts.windowDescription')}
        >
          <ShortcutPicker
            value={preferences?.window_screenshot_shortcut ?? null}
            defaultValue={defaults?.window ?? 'CommandOrControl+Shift+8'}
            onChange={shortcut =>
              handleScreenshotShortcutChange(
                'Window',
                'window_screenshot_shortcut',
                shortcut
              )
            }
            disabled={isDisabled}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.shortcuts.navigationTitle')}>
        <div className="rounded-lg border border-border">
          {NAVIGATION_SHORTCUTS.map((shortcut, i) => (
            <div
              key={shortcut.description}
              className={`flex items-center justify-between px-4 py-3 ${
                i < NAVIGATION_SHORTCUTS.length - 1
                  ? 'border-b border-border'
                  : ''
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
      </SettingsSection>
    </div>
  )
}
