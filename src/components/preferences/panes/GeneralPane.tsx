import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ShortcutPicker } from '../ShortcutPicker'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { commands } from '@/lib/tauri-bindings'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'
import { logger } from '@/lib/logger'
import type { DifficultyLevel } from '@/features/chat/stores/chatStore'

export function GeneralPane() {
  const { t } = useTranslation()
  const difficulty = useSettingsStore(state => state.difficulty)

  // Load preferences for keyboard shortcuts
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  // Get the default shortcut from the backend
  const { data: defaultShortcut } = useQuery({
    queryKey: ['default-quick-pane-shortcut'],
    queryFn: async () => {
      return await commands.getDefaultQuickPaneShortcut()
    },
    staleTime: Infinity,
  })

  const handleShortcutChange = async (newShortcut: string | null) => {
    if (!preferences) return

    const oldShortcut = preferences.quick_pane_shortcut

    logger.info('Updating quick pane shortcut', { oldShortcut, newShortcut })

    const result = await commands.updateQuickPaneShortcut(newShortcut)

    if (result.status === 'error') {
      logger.error('Failed to register shortcut', { error: result.error })
      toast.error(t('toast.error.shortcutFailed'), {
        description: result.error,
      })
      return
    }

    try {
      await savePreferences.mutateAsync({
        ...preferences,
        quick_pane_shortcut: newShortcut,
      })
    } catch {
      logger.warn('Save failed, rolling back shortcut registration', {
        oldShortcut,
        newShortcut,
      })

      const rollbackResult = await commands.updateQuickPaneShortcut(oldShortcut)

      if (rollbackResult.status === 'error') {
        logger.error(
          'Rollback failed - backend and preferences are out of sync',
          {
            error: rollbackResult.error,
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

  const handleDifficultyChange = (value: string) => {
    const validLevels: DifficultyLevel[] = [
      'beginner',
      'intermediate',
      'advanced',
    ]
    if (!validLevels.includes(value as DifficultyLevel)) return
    const { setDifficulty } = useSettingsStore.getState()
    setDifficulty(value as DifficultyLevel)
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.general.tutoring')}>
        <SettingsField
          label={t('preferences.general.difficulty')}
          description={t('preferences.general.difficultyDescription')}
        >
          <Select value={difficulty} onValueChange={handleDifficultyChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">
                <div className="flex items-center gap-2">
                  <span>{t('preferences.general.difficulty.beginner')}</span>
                </div>
              </SelectItem>
              <SelectItem value="intermediate">
                <div className="flex items-center gap-2">
                  <span>
                    {t('preferences.general.difficulty.intermediate')}
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="advanced">
                <div className="flex items-center gap-2">
                  <span>{t('preferences.general.difficulty.advanced')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Label className="mt-1 block text-xs text-muted-foreground">
            {difficulty === 'beginner' &&
              t('preferences.general.difficulty.beginnerHint')}
            {difficulty === 'intermediate' &&
              t('preferences.general.difficulty.intermediateHint')}
            {difficulty === 'advanced' &&
              t('preferences.general.difficulty.advancedHint')}
          </Label>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.general.keyboardShortcuts')}>
        <SettingsField
          label={t('preferences.general.quickPaneShortcut')}
          description={t('preferences.general.quickPaneShortcutDescription')}
        >
          <ShortcutPicker
            value={preferences?.quick_pane_shortcut ?? null}
            defaultValue={defaultShortcut ?? 'CommandOrControl+Shift+.'}
            onChange={handleShortcutChange}
            disabled={!preferences || savePreferences.isPending}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
