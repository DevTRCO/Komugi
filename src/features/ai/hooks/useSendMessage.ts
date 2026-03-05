import { useRef } from 'react'
import {
  useChatStore,
  selectActiveSession,
} from '@/features/chat/stores/chatStore'
import type {
  ChatMessage,
  DifficultyLevel,
  ScreenshotAttachment,
} from '@/features/chat/stores/chatStore'
import { streamGeminiResponse } from '../api/gemini'
import {
  extractUrls,
  fetchUrlContents,
  buildEnrichedMessage,
} from '../utils/url-enrichment'
import { formatProfileForPrompt } from '../utils/learning-profile'
import { commands } from '@/lib/tauri-bindings'
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

async function loadProfileSummary(): Promise<string | undefined> {
  try {
    const result = await commands.loadLearningProfile()
    if (result.status === 'ok' && result.data.entries.length > 0) {
      return formatProfileForPrompt(result.data.entries)
    }
  } catch {
    logger.warn('Failed to load learning profile')
  }
  return undefined
}

export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null)

  /** Shared streaming logic: sends messages to Gemini and handles streaming response. */
  async function streamToCompletion(
    screenshotBase64: string,
    previousMessages: readonly ChatMessage[],
    apiMessage: string,
    difficulty: string,
    controller: AbortController,
    currentScreenshot?: ScreenshotAttachment,
    profileSummary?: string
  ): Promise<void> {
    const { finalizeStreaming, setLastError } = useChatStore.getState()

    try {
      const result = await streamGeminiResponse(
        screenshotBase64,
        previousMessages,
        apiMessage,
        difficulty as DifficultyLevel,
        chunk => {
          useChatStore.getState().appendStreamingContent(chunk)
        },
        controller.signal,
        currentScreenshot,
        attempt => {
          useChatStore.setState({ streamingContent: '', retryAttempt: attempt })
        },
        profileSummary
      )

      if (!controller.signal.aborted) {
        finalizeStreaming()

        if (!result.complete) {
          setLastError(getIncompleteWarning(result.finishReason))
        }
      }
    } finally {
      useChatStore.getState().setRetryAttempt(null)
    }
  }

  function send(message: string, displayMessage?: string): void {
    void sendAsync(message, displayMessage)
  }

  async function sendAsync(
    message: string,
    displayMessage?: string
  ): Promise<void> {
    const state = useChatStore.getState()
    const session = selectActiveSession(state)
    const { addUserMessage, setIsGenerating, setLastError } = state

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

      const profileSummary = await loadProfileSummary()

      await streamToCompletion(
        screenshotBase64,
        previousMessages,
        apiMessage,
        difficulty,
        controller,
        currentScreenshot ?? undefined,
        profileSummary
      )
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

  /** Re-send the last user message in the current session (used after edit/fork). */
  async function resendAsync(): Promise<void> {
    const state = useChatStore.getState()
    const session = selectActiveSession(state)
    const { setIsGenerating, setLastError } = state

    if (!session) {
      logger.warn('Cannot resend: no active session')
      return
    }

    const userMessages = session.messages.filter(m => m.role === 'user')
    const lastUserMsg = userMessages[userMessages.length - 1]
    if (!lastUserMsg) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsGenerating(true)

    try {
      // Messages up to (not including) the last user message are "previous"
      const previousMessages = session.messages.slice(
        0,
        session.messages.indexOf(lastUserMsg)
      )

      const screenshotAttachment: ScreenshotAttachment | undefined =
        lastUserMsg.screenshotBase64
          ? {
              imageBase64: lastUserMsg.screenshotBase64,
              width: lastUserMsg.screenshotWidth ?? 0,
              height: lastUserMsg.screenshotHeight ?? 0,
            }
          : undefined

      const profileSummary = await loadProfileSummary()

      await streamToCompletion(
        session.screenshotBase64,
        previousMessages,
        lastUserMsg.content,
        session.difficulty,
        controller,
        screenshotAttachment,
        profileSummary
      )
    } catch (error) {
      if (controller.signal.aborted) {
        useChatStore.setState({ isGenerating: false, streamingContent: '' })
        return
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error('AI resend failed', { error: errorMessage })
      setLastError(errorMessage)
    }
  }

  function resend(): void {
    void resendAsync()
  }

  function abort(): void {
    abortRef.current?.abort()
    abortRef.current = null
    useChatStore.setState({
      isGenerating: false,
      streamingContent: '',
      retryAttempt: null,
    })
  }

  return { send, resend, abort }
}
