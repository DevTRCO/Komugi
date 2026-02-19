import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { DifficultyLevel } from '@/lib/schemas'
import { SettingsPersistedSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'

interface SettingsState {
  /** Current difficulty level for AI tutoring */
  difficulty: DifficultyLevel
  /** Whether the API key has been validated (key itself is in .env) */
  apiKeyConfigured: boolean
  /** Number of days to keep history sessions (0 = keep forever) */
  historyRetentionDays: number

  setDifficulty: (level: DifficultyLevel) => void
  setApiKeyConfigured: (configured: boolean) => void
  setHistoryRetentionDays: (days: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      set => ({
        difficulty: 'intermediate',
        apiKeyConfigured: false,
        historyRetentionDays: 30,

        setDifficulty: level =>
          set({ difficulty: level }, undefined, 'setDifficulty'),

        setApiKeyConfigured: configured =>
          set(
            { apiKeyConfigured: configured },
            undefined,
            'setApiKeyConfigured'
          ),

        setHistoryRetentionDays: days =>
          set(
            { historyRetentionDays: days },
            undefined,
            'setHistoryRetentionDays'
          ),
      }),
      {
        name: 'komugi-settings',
        merge: (persisted: unknown, current: SettingsState): SettingsState => {
          if (typeof persisted !== 'object' || persisted === null)
            return current

          const result = SettingsPersistedSchema.partial().safeParse(persisted)
          if (!result.success) {
            logger.warn('Rehydration: invalid settings data, using defaults', {
              errors: result.error.flatten().fieldErrors,
            })
            return current
          }

          return { ...current, ...result.data }
        },
      }
    ),
    { name: 'settings-store' }
  )
)
