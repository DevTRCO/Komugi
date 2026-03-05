import { useEffect, useRef } from 'react'
import { useChatStore } from '@/features/chat/stores/chatStore'
import type { ChatSession } from '@/features/chat/stores/chatStore'
import { generateSessionSummary } from '../api/gemini-summary'
import { commands } from '@/lib/tauri-bindings'
import type { LearningProfileEntry } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

const MIN_USER_MESSAGES = 1
const MIN_ASSISTANT_MESSAGES = 1

/**
 * Detects session switches and fires a summary call for the previous session.
 * Same subscription pattern as useSaveSessionToHistory.
 */
export function useSessionSummary() {
  const prevSessionIdRef = useRef<string | null>(null)
  const prevSessionsRef = useRef<Map<string, ChatSession>>(new Map())

  useEffect(() => {
    const { activeSessionId, sessions } = useChatStore.getState()
    prevSessionIdRef.current = activeSessionId
    for (const s of sessions) {
      prevSessionsRef.current.set(s.id, s)
    }

    const unsubscribe = useChatStore.subscribe(state => {
      const currentSessionId = state.activeSessionId

      // Update session snapshots
      for (const s of state.sessions) {
        prevSessionsRef.current.set(s.id, s)
      }

      // Detect session switch
      const prevId = prevSessionIdRef.current
      if (prevId && prevId !== currentSessionId) {
        const prevSession = prevSessionsRef.current.get(prevId)
        if (prevSession && shouldSummarize(prevSession)) {
          triggerSessionSummary(prevSession)
        }
      }

      prevSessionIdRef.current = currentSessionId

      // Clean up sessions no longer in the store
      const currentIds = new Set(state.sessions.map(s => s.id))
      for (const id of prevSessionsRef.current.keys()) {
        if (!currentIds.has(id)) prevSessionsRef.current.delete(id)
      }
    })

    return unsubscribe
  }, [])
}

function shouldSummarize(session: ChatSession): boolean {
  const userCount = session.messages.filter(m => m.role === 'user').length
  const assistantCount = session.messages.filter(
    m => m.role === 'assistant'
  ).length
  return (
    userCount >= MIN_USER_MESSAGES && assistantCount >= MIN_ASSISTANT_MESSAGES
  )
}

function triggerSessionSummary(session: ChatSession): void {
  void (async () => {
    try {
      const result = await generateSessionSummary(
        session.messages,
        session.difficulty
      )
      if (!result) return

      const entry: LearningProfileEntry = {
        session_id: session.id,
        date: new Date().toISOString(),
        difficulty: session.difficulty,
        summary: result.summary,
        topics: result.topics,
      }

      const saveResult = await commands.appendLearningProfileEntry(entry)
      if (saveResult.status === 'error') {
        logger.warn('Failed to save learning profile entry', {
          error: saveResult.error,
        })
      } else {
        logger.info('Learning profile entry saved', {
          sessionId: session.id,
          topics: result.topics,
        })
      }
    } catch (error) {
      logger.warn('Session summary failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()
}
