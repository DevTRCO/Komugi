import { useRef } from 'react'
import {
  useChatStore,
  selectActiveSession,
} from '@/features/chat/stores/chatStore'
import { streamGeminiResponse } from '../api/gemini'
import {
  extractUrls,
  fetchUrlContents,
  buildEnrichedMessage,
} from '../utils/url-enrichment'
import { logger } from '@/lib/logger'

function getIncompleteWarning(finishReason: string | null): string {
  switch (finishReason) {
    case 'SAFETY':
      return 'Response was filtered for safety reasons and may be incomplete.'
    case 'MAX_TOKENS':
      return 'Response reached the maximum length and may be incomplete.'
    default:
      return 'Response may be incomplete due to a connection issue.'
  }
}

export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null)

  function send(message: string, displayMessage?: string): void {
    void sendAsync(message, displayMessage)
  }

  async function sendAsync(
    message: string,
    displayMessage?: string
  ): Promise<void> {
    const state = useChatStore.getState()
    const session = selectActiveSession(state)
    const { addUserMessage, finalizeStreaming, setIsGenerating, setLastError } =
      state

    if (!session) {
      logger.warn('Cannot send message: no active session')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Capture state before addUserMessage clears pendingScreenshot
    const currentScreenshot = state.pendingScreenshot
    const previousMessages = session.messages
    const { screenshotBase64, difficulty } = session

    addUserMessage(displayMessage ?? message, currentScreenshot ?? undefined)
    setIsGenerating(true)

    try {
      let apiMessage = message
      const urls = extractUrls(message)
      if (urls.length > 0) {
        const fetched = await fetchUrlContents(urls)
        if (controller.signal.aborted) {
          setIsGenerating(false)
          return
        }
        apiMessage = buildEnrichedMessage(message, fetched)
      }

      const result = await streamGeminiResponse(
        screenshotBase64,
        previousMessages,
        apiMessage,
        difficulty,
        chunk => {
          useChatStore.getState().appendStreamingContent(chunk)
        },
        controller.signal,
        currentScreenshot ?? undefined
      )

      if (!controller.signal.aborted) {
        finalizeStreaming()

        if (!result.complete) {
          setLastError(getIncompleteWarning(result.finishReason))
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        useChatStore.setState({ isGenerating: false, streamingContent: '' })
        return
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error('AI response failed', { error: errorMessage })
      setLastError(errorMessage)
    }
  }

  function abort(): void {
    abortRef.current?.abort()
    abortRef.current = null
    useChatStore.setState({ isGenerating: false, streamingContent: '' })
  }

  return { send, abort }
}
