import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ChatSkinId, DifficultyLevel } from '@/lib/schemas'
import { SettingsPersistedSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'

interface SettingsState {
  /** Current difficulty level for AI tutoring */
  difficulty: DifficultyLevel
  /** Whether an API key is stored in the system keychain */
  apiKeyConfigured: boolean
  /** Number of days to keep history sessions (0 = keep forever) */
  historyRetentionDays: number
  /** Active chat skin */
  chatSkin: ChatSkinId

  setDifficulty: (level: DifficultyLevel) => void
  setApiKeyConfigured: (configured: boolean) => void
  setHistoryRetentionDays: (days: number) => void
  setChatSkin: (skin: ChatSkinId) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      set => ({
        difficulty: 'intermediate',
        apiKeyConfigured: false,
        historyRetentionDays: 30,
        chatSkin: 'classic',

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

        setChatSkin: skin => set({ chatSkin: skin }, undefined, 'setChatSkin'),
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
