import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { DifficultyLevel } from '@/features/chat/stores/chatStore'

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
      { name: 'komugi-settings' }
    ),
    { name: 'settings-store' }
  )
)
