import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useHistoryStore } from '@/features/history'
import { logger } from '@/lib/logger'
import type { ChatSession } from '../stores/chatStore'

/**
 * Watches chat store and saves completed sessions to history
 * when they are ended (session goes from non-null to null with messages).
 *
 * Mount once in the main window component tree.
 */
export function useSaveSessionToHistory() {
  const prevSessionRef = useRef<ChatSession | null>(null)

  useEffect(() => {
    prevSessionRef.current = useChatStore.getState().currentSession

    const unsubscribe = useChatStore.subscribe(state => {
      const prevSession = prevSessionRef.current
      const currentSession = state.currentSession

      // Detect session ending: was non-null with messages, now null
      if (prevSession && prevSession.messages.length > 0 && !currentSession) {
        logger.info('Session ended, saving to history', {
          id: prevSession.id,
          messageCount: prevSession.messages.length,
        })
        const { addSession } = useHistoryStore.getState()
        addSession(prevSession)
      }

      prevSessionRef.current = currentSession
    })

    return unsubscribe
  }, [])
}
