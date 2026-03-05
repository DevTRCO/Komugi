import { useTranslation } from 'react-i18next'
import { getVersion } from '@tauri-apps/api/app'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { LearningProfileList } from '../LearningProfileList'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { commands } from '@/lib/tauri-bindings'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'
import { logger } from '@/lib/logger'
import type { DifficultyLevel } from '@/features/chat/stores/chatStore'

export function GeneralPane() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const difficulty = useSettingsStore(state => state.difficulty)
  const historyRetentionDays = useSettingsStore(
    state => state.historyRetentionDays
  )

  // Load preferences for keyboard shortcuts
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  // Learning profile data
  const { data: learningProfile } = useQuery({
    queryKey: ['learning-profile'],
    queryFn: async () => {
      const result = await commands.loadLearningProfile()
      if (result.status === 'ok') return result.data
      return { version: 1, entries: [] }
    },
  })

  const handleDeleteProfileEntry = async (sessionId: string) => {
    const result = await commands.deleteLearningProfileEntry(sessionId)
    if (result.status === 'error') {
      logger.warn('Failed to delete profile entry', { error: result.error })
    }
    await queryClient.invalidateQueries({ queryKey: ['learning-profile'] })
  }

  const handleClearProfile = async () => {
    const result = await commands.clearLearningProfile()
    if (result.status === 'error') {
      logger.warn('Failed to clear learning profile', { error: result.error })
    }
    await queryClient.invalidateQueries({ queryKey: ['learning-profile'] })
  }

  // App version
  const { data: appVersion } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => getVersion(),
    staleTime: Infinity,
  })

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

  const handleRetentionChange = (value: string) => {
    const days = parseInt(value, 10)
    if (Number.isNaN(days)) return
    const { setHistoryRetentionDays } = useSettingsStore.getState()
    setHistoryRetentionDays(days)
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
            {t(`preferences.general.difficulty.${difficulty}Hint`)}
          </Label>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.general.history')}>
        <SettingsField
          label={t('preferences.general.historyRetention')}
          description={t('preferences.general.historyRetentionDescription')}
        >
          <Select
            value={String(historyRetentionDays)}
            onValueChange={handleRetentionChange}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">
                {t('preferences.general.historyRetention.7days')}
              </SelectItem>
              <SelectItem value="14">
                {t('preferences.general.historyRetention.14days')}
              </SelectItem>
              <SelectItem value="30">
                {t('preferences.general.historyRetention.30days')}
              </SelectItem>
              <SelectItem value="90">
                {t('preferences.general.historyRetention.90days')}
              </SelectItem>
              <SelectItem value="0">
                {t('preferences.general.historyRetention.forever')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.general.learningMemory')}>
        <SettingsField
          label={t('preferences.general.learningMemory')}
          description={t('preferences.general.learningMemoryDescription')}
        >
          <LearningProfileList
            entries={learningProfile?.entries ?? []}
            onDelete={handleDeleteProfileEntry}
            onClearAll={handleClearProfile}
          />
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

      {appVersion && (
        <p className="text-center text-xs text-muted-foreground">
          Komugi v{appVersion}
        </p>
      )}
    </div>
  )
}
