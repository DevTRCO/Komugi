import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import type { ChatSession, ChatMessage } from '../stores/chatStore'
import { commands } from '@/lib/tauri-bindings'
import type { StoredSession, StoredMessage } from '@/lib/tauri-bindings'
import { useHistoryStore } from '@/features/history'
import { logger } from '@/lib/logger'

export function useSaveSessionToHistory() {
  const prevMessagesCountRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const { sessions } = useChatStore.getState()
    for (const s of sessions) {
      prevMessagesCountRef.current.set(s.id, s.messages.length)
    }

    const unsubscribe = useChatStore.subscribe(state => {
      const prevCounts = prevMessagesCountRef.current

      for (const session of state.sessions) {
        const prevCount = prevCounts.get(session.id) ?? 0

        if (prevCount === 0 && session.messages.length === 0) {
          saveFullSession(session)
          prevCounts.set(session.id, 0)
        } else if (session.messages.length > prevCount) {
          const newMessages = session.messages.slice(prevCount)
          saveMessages(session.id, newMessages, prevCount)
          prevCounts.set(session.id, session.messages.length)
        }
      }

      const currentIds = new Set(state.sessions.map(s => s.id))
      for (const id of prevCounts.keys()) {
        if (!currentIds.has(id)) {
          prevCounts.delete(id)
        }
      }
    })

    return unsubscribe
  }, [])
}

function toStoredSession(session: ChatSession): StoredSession {
  const now = Date.now()
  return {
    id: session.id,
    screenshot_base64: session.screenshotBase64,
    screenshot_width: session.screenshotWidth,
    screenshot_height: session.screenshotHeight,
    difficulty: session.difficulty,
    created_at: session.createdAt,
    updated_at: now,
    messages: session.messages.map((m, i) => toStoredMessage(m, session.id, i)),
  }
}

function toStoredMessage(
  msg: ChatMessage,
  sessionId: string,
  sortOrder: number
): StoredMessage {
  return {
    id: msg.id,
    session_id: sessionId,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    sort_order: sortOrder,
    screenshot_base64: msg.screenshotBase64 ?? null,
    screenshot_width: msg.screenshotWidth ?? null,
    screenshot_height: msg.screenshotHeight ?? null,
  }
}

async function saveFullSession(session: ChatSession) {
  const stored = toStoredSession(session)
  const result = await commands.historySaveSession(stored)
  if (result.status === 'error') {
    logger.error('Failed to save session to SQLite', { error: result.error })
  } else {
    logger.debug('Session saved to SQLite', { id: session.id })
    useHistoryStore.getState().refresh()
  }
}

async function saveMessages(
  sessionId: string,
  newMessages: readonly ChatMessage[],
  startIndex: number
) {
  const stored = newMessages.map((m, i) =>
    toStoredMessage(m, sessionId, startIndex + i)
  )
  const result = await commands.historySaveMessages(sessionId, stored)
  if (result.status === 'error') {
    logger.error('Failed to save messages to SQLite', { error: result.error })
  } else {
    logger.debug('Messages saved to SQLite', {
      sessionId,
      count: stored.length,
    })
    useHistoryStore.getState().refresh()
  }
}
