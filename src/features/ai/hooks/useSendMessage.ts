import { useRef, useCallback } from 'react'
import { useChatStore } from '@/features/chat/stores/chatStore'
import { streamGeminiResponse } from '../api/gemini'
import { logger } from '@/lib/logger'

/**
 * Hook for sending messages and streaming AI responses.
 * Returns a send function and an abort function.
 */
export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (message: string) => {
    const {
      currentSession,
      addUserMessage,
      finalizeStreaming,
      setIsGenerating,
      setLastError,
    } = useChatStore.getState()

    if (!currentSession) {
      logger.warn('Cannot send message: no active session')
      return
    }

    if (currentSession.messages.length >= 30) {
      setLastError('Maximum messages per session reached')
      return
    }

    // Abort any previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    addUserMessage(message)
    setIsGenerating(true)

    try {
      // Get fresh state after addUserMessage
      const freshSession = useChatStore.getState().currentSession
      if (!freshSession) return

      await streamGeminiResponse(
        freshSession.screenshotBase64,
        freshSession.messages,
        message,
        freshSession.difficulty,
        chunk => {
          const { appendStreamingContent: append } = useChatStore.getState()
          append(chunk)
        },
        controller.signal
      )

      // Only finalize if not aborted
      if (!controller.signal.aborted) {
        finalizeStreaming()
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // User cancelled — clear streaming state and partial content
        useChatStore.setState({ isGenerating: false, streamingContent: '' })
        return
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error('AI response failed', { error: errorMessage })
      setLastError(errorMessage)
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    useChatStore.setState({ isGenerating: false, streamingContent: '' })
  }, [])

  return { send, abort }
}
