import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { commands } from '@/lib/tauri-bindings'
import type { StoredSessionSummary } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

interface HistoryState {
  /** List of past session summaries, newest first */
  sessions: readonly StoredSessionSummary[]
  /** Whether initial load from SQLite is in progress */
  isLoading: boolean

  loadSessions: () => Promise<void>
  removeSession: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  /** Refresh the sessions list from DB (e.g. after saving a new session) */
  refresh: () => Promise<void>
}

const MAX_HISTORY_SESSIONS = 50

export const useHistoryStore = create<HistoryState>()(
  devtools(
    (set, get) => ({
      sessions: [],
      isLoading: false,

      loadSessions: async () => {
        if (get().isLoading) return
        set({ isLoading: true }, undefined, 'loadSessions/start')

        const result = await commands.historyListSessions(
          MAX_HISTORY_SESSIONS,
          0
        )
        if (result.status === 'ok') {
          set(
            { sessions: result.data, isLoading: false },
            undefined,
            'loadSessions/success'
          )
        } else {
          logger.error('Failed to load history sessions', {
            error: result.error,
          })
          set({ isLoading: false }, undefined, 'loadSessions/error')
        }
      },

      removeSession: async (id: string) => {
        // Optimistic update
        const prev = get().sessions
        set(
          { sessions: prev.filter(s => s.id !== id) },
          undefined,
          'removeSession'
        )

        const result = await commands.historyDeleteSession(id)
        if (result.status === 'error') {
          logger.error('Failed to delete session', { error: result.error })
          // Rollback
          set({ sessions: prev }, undefined, 'removeSession/rollback')
        }
      },

      clearHistory: async () => {
        const prev = get().sessions
        set({ sessions: [] }, undefined, 'clearHistory')

        const result = await commands.historyClearAll()
        if (result.status === 'error') {
          logger.error('Failed to clear history', { error: result.error })
          set({ sessions: prev }, undefined, 'clearHistory/rollback')
        }
      },

      refresh: async () => {
        const result = await commands.historyListSessions(
          MAX_HISTORY_SESSIONS,
          0
        )
        if (result.status === 'ok') {
          set({ sessions: result.data }, undefined, 'refresh')
        }
      },
    }),
    { name: 'history-store' }
  )
)
