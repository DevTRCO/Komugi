import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ChatSession } from '@/features/chat/stores/chatStore'
import { validateArray, isSessionSummary } from '@/lib/store-validation'

/** Lightweight session summary for the sidebar list (no screenshot data) */
export interface SessionSummary {
  id: string
  /** First user message as preview text */
  preview: string
  messageCount: number
  createdAt: number
}

interface HistoryState {
  /** List of past session summaries, newest first */
  sessions: readonly SessionSummary[]

  addSession: (session: ChatSession) => void
  removeSession: (id: string) => void
  clearHistory: () => void
}

const MAX_HISTORY_SESSIONS = 50

export const useHistoryStore = create<HistoryState>()(
  devtools(
    persist(
      (set, get) => ({
        sessions: [],

        addSession: (session: ChatSession) => {
          const firstUserMessage = session.messages.find(m => m.role === 'user')
          if (!firstUserMessage) return

          const summary: SessionSummary = {
            id: session.id,
            preview:
              firstUserMessage.content.length > 80
                ? `${firstUserMessage.content.slice(0, 80)}...`
                : firstUserMessage.content,
            messageCount: session.messages.length,
            createdAt: session.createdAt,
          }

          const existing = get().sessions
          // Don't duplicate
          if (existing.some(s => s.id === session.id)) return

          const updated = [summary, ...existing].slice(0, MAX_HISTORY_SESSIONS)
          set({ sessions: updated }, undefined, 'addSession')
        },

        removeSession: id => {
          const updated = get().sessions.filter(s => s.id !== id)
          set({ sessions: updated }, undefined, 'removeSession')
        },

        clearHistory: () => set({ sessions: [] }, undefined, 'clearHistory'),
      }),
      {
        name: 'komugi-history',
        merge: (persisted: unknown, current: HistoryState): HistoryState => {
          if (typeof persisted !== 'object' || persisted === null)
            return current
          const p = persisted as Record<string, unknown>
          return {
            ...current,
            sessions: validateArray(
              p.sessions,
              isSessionSummary,
              'history.sessions'
            ),
          }
        },
      }
    ),
    { name: 'history-store' }
  )
)
