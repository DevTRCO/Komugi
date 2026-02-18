import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { DifficultyLevel } from '@/features/chat/stores/chatStore'
import { isDifficultyLevel } from '@/lib/store-validation'
import { logger } from '@/lib/logger'

interface SettingsState {
  /** Current difficulty level for AI tutoring */
  difficulty: DifficultyLevel
  /** Whether the API key has been validated (key itself is in .env) */
  apiKeyConfigured: boolean

  setDifficulty: (level: DifficultyLevel) => void
  setApiKeyConfigured: (configured: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      set => ({
        difficulty: 'intermediate',
        apiKeyConfigured: false,

        setDifficulty: level =>
          set({ difficulty: level }, undefined, 'setDifficulty'),

        setApiKeyConfigured: configured =>
          set(
            { apiKeyConfigured: configured },
            undefined,
            'setApiKeyConfigured'
          ),
      }),
      {
        name: 'komugi-settings',
        merge: (persisted: unknown, current: SettingsState): SettingsState => {
          if (typeof persisted !== 'object' || persisted === null)
            return current
          const p = persisted as Record<string, unknown>

          const difficulty = isDifficultyLevel(p.difficulty)
            ? p.difficulty
            : current.difficulty
          const apiKeyConfigured =
            typeof p.apiKeyConfigured === 'boolean'
              ? p.apiKeyConfigured
              : current.apiKeyConfigured

          if (
            !isDifficultyLevel(p.difficulty) ||
            typeof p.apiKeyConfigured !== 'boolean'
          ) {
            logger.warn(
              'Rehydration: invalid settings data, using defaults for invalid fields',
              { difficulty: p.difficulty, apiKeyConfigured: p.apiKeyConfigured }
            )
          }

          return { ...current, difficulty, apiKeyConfigured }
        },
      }
    ),
    { name: 'settings-store' }
  )
)
