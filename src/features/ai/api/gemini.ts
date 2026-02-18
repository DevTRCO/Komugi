import { logger } from '@/lib/logger'
import type {
  ChatMessage,
  DifficultyLevel,
  ScreenshotAttachment,
} from '@/features/chat/stores/chatStore'
import { buildSystemPrompt, buildUserPrompt } from '../config/prompts'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL = 'gemini-3-flash-preview'
const MAX_OUTPUT_TOKENS = 65_536
const THINKING_BUDGET = 8_192
const REQUEST_TIMEOUT_MS = 120_000

interface GeminiPart {
  text?: string
  thought?: boolean
  inline_data?: { mime_type: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiStreamChunk {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }[]
  error?: { message: string }
}

export interface StreamResult {
  /** The accumulated response text */
  text: string
  /** Whether the stream completed normally (finishReason === 'STOP') */
  complete: boolean
  /** The finish reason from the last chunk, if received */
  finishReason: string | null
}

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  if (!key) {
    throw new Error('VITE_GEMINI_API_KEY is not set. Add it to your .env file.')
  }
  return key
}

function buildContents(
  screenshotBase64: string,
  messages: readonly ChatMessage[],
  currentUserMessage: string,
  currentMessageScreenshot?: ScreenshotAttachment
): GeminiContent[] {
  const contents: GeminiContent[] = []
  const sessionScreenshotPart: GeminiPart = {
    inline_data: { mime_type: 'image/png', data: screenshotBase64 },
  }
  let screenshotAttached = false

  for (const msg of messages) {
    if (msg.role === 'user') {
      const parts: GeminiPart[] = []

      if (!screenshotAttached) {
        parts.push(sessionScreenshotPart)
        screenshotAttached = true
      }

      if (msg.screenshotBase64) {
        parts.push({
          inline_data: { mime_type: 'image/png', data: msg.screenshotBase64 },
        })
      }

      parts.push({ text: msg.content })
      contents.push({ role: 'user', parts })
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] })
    }
  }

  const isFirstUserMessage = !screenshotAttached
  const hasNewScreenshot = !!currentMessageScreenshot
  const currentParts: GeminiPart[] = []
  if (isFirstUserMessage) {
    currentParts.push(sessionScreenshotPart)
  }
  if (currentMessageScreenshot) {
    currentParts.push({
      inline_data: {
        mime_type: 'image/png',
        data: currentMessageScreenshot.imageBase64,
      },
    })
  }
  currentParts.push({
    text: buildUserPrompt(
      currentUserMessage,
      isFirstUserMessage,
      hasNewScreenshot
    ),
  })
  contents.push({ role: 'user', parts: currentParts })

  return contents
}

function getUserFacingError(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. The message or screenshot may be too large.'
    case 401:
    case 403:
      return 'API key is invalid or expired. Check your VITE_GEMINI_API_KEY.'
    case 429:
      return 'Rate limit exceeded. Please wait a moment and try again.'
    case 500:
    case 502:
    case 503:
      return 'Gemini API is temporarily unavailable. Please try again later.'
    default:
      return `AI service error (${status}). Please try again.`
  }
}

export async function streamGeminiResponse(
  screenshotBase64: string,
  messages: readonly ChatMessage[],
  currentUserMessage: string,
  difficulty: DifficultyLevel,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  currentMessageScreenshot?: ScreenshotAttachment
): Promise<StreamResult> {
  const apiKey = getApiKey()
  const contents = buildContents(
    screenshotBase64,
    messages,
    currentUserMessage,
    currentMessageScreenshot
  )

  const url = `${GEMINI_API_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`

  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(difficulty) }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      thinkingConfig: {
        thinkingBudget: THINKING_BUDGET,
      },
    },
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Combine external signal with timeout
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, 500)
      logger.error('Gemini API error', {
        status: response.status,
        body: errorBody,
      })
      const userMessage = getUserFacingError(response.status)
      throw new Error(userMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body stream')
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''
    let finishReason: string | null = null
    let skippedChunks = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE lines
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue

        try {
          const chunk: GeminiStreamChunk = JSON.parse(data)

          if (chunk.error) {
            throw new Error(
              typeof chunk.error.message === 'string'
                ? chunk.error.message
                : 'Gemini API returned an error'
            )
          }

          const candidate = chunk.candidates?.[0]
          const parts = candidate?.content?.parts
          if (parts) {
            for (const part of parts) {
              // Filter out thinking/reasoning parts — only show response text
              if (part.thought) continue
              if (part.text) {
                fullText += part.text
                onChunk(part.text)
              }
            }
          }

          const reason = candidate?.finishReason
          if (reason) {
            finishReason = reason
          }
        } catch (parseError) {
          // Skip unparseable SSE lines — happens with partial JSON
          if (
            parseError instanceof SyntaxError ||
            (parseError instanceof Error && parseError.message.includes('JSON'))
          ) {
            skippedChunks++
            continue
          }
          throw parseError
        }
      }
    }

    if (skippedChunks > 0) {
      logger.debug('SSE parser skipped unparseable chunks', { skippedChunks })
    }

    const complete = finishReason === 'STOP'
    if (!complete && fullText.length > 0) {
      logger.warn('Stream ended without STOP finish reason', {
        finishReason,
        textLength: fullText.length,
      })
    }

    return { text: fullText, complete, finishReason }
  } finally {
    clearTimeout(timeoutId)
  }
}
