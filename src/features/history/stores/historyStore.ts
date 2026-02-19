import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { commands } from '@/lib/tauri-bindings'
import type { StoredSessionSummary } from '@/lib/tauri-bindings'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'
import { logger } from '@/lib/logger'

interface HistoryState {
  /** List of past session summaries, newest first */
  sessions: readonly StoredSessionSummary[]
  /** Whether initial load from SQLite is in progress */
  isLoading: boolean
  /** Current search query (empty = no search active) */
  searchQuery: string
  /** Search results, null when not searching */
  searchResults: readonly StoredSessionSummary[] | null

  loadSessions: () => Promise<void>
  removeSession: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  /** Refresh the sessions list from DB (e.g. after saving a new session) */
  refresh: () => Promise<void>
  /** Search sessions by message content */
  searchSessions: (query: string) => Promise<void>
  /** Clear search and return to normal list */
  clearSearch: () => void
}

const MAX_HISTORY_SESSIONS = 50

export const useHistoryStore = create<HistoryState>()(
  devtools(
    (set, get) => ({
      sessions: [],
      isLoading: false,
      searchQuery: '',
      searchResults: null,

      loadSessions: async () => {
        if (get().isLoading) return
        set({ isLoading: true }, undefined, 'loadSessions/start')

        // Auto-cleanup old sessions before loading (BIZ-1: configurable retention)
        const retentionDays = useSettingsStore.getState().historyRetentionDays
        if (retentionDays > 0) {
          const cleanupResult = await commands.historyCleanupOldSessions(
            retentionDays * 24
          )
          if (cleanupResult.status === 'ok' && cleanupResult.data > 0) {
            logger.info('Cleaned up old sessions', {
              count: cleanupResult.data,
            })
          }
        }

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

      searchSessions: async (query: string) => {
        set({ searchQuery: query }, undefined, 'searchSessions/start')

        if (!query.trim()) {
          set({ searchResults: null }, undefined, 'searchSessions/cleared')
          return
        }

        const result = await commands.historySearchSessions(
          query,
          MAX_HISTORY_SESSIONS,
          0
        )

        // Stale-query guard: abort if query changed while awaiting
        if (get().searchQuery !== query) return

        if (result.status === 'ok') {
          set(
            { searchResults: result.data },
            undefined,
            'searchSessions/success'
          )
        } else {
          logger.error('Failed to search sessions', { error: result.error })
        }
      },

      clearSearch: () => {
        set({ searchQuery: '', searchResults: null }, undefined, 'clearSearch')
      },
    }),
    { name: 'history-store' }
  )
)
