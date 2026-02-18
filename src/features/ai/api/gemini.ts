import { logger } from '@/lib/logger'
import type { DifficultyLevel } from '@/features/chat/stores/chatStore'
import type { ChatMessage } from '@/features/chat/stores/chatStore'
import { buildSystemPrompt, buildUserPrompt } from '../config/prompts'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL = 'gemini-2.5-flash-preview-05-20'
const MAX_TOKENS = 1024
const REQUEST_TIMEOUT_MS = 30_000

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiStreamChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  error?: { message: string }
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
  difficulty: DifficultyLevel
): GeminiContent[] {
  const contents: GeminiContent[] = []

  // System instruction is handled separately in Gemini API
  // First message includes the screenshot
  const isFirstUserMessage =
    messages.filter(m => m.role === 'user').length === 0

  // Add conversation history
  for (const msg of messages) {
    if (msg.role === 'user') {
      const isVeryFirst =
        messages.indexOf(msg) === messages.findIndex(m => m.role === 'user')
      const parts: GeminiPart[] = []

      if (isVeryFirst) {
        // First user message includes screenshot
        parts.push({
          inline_data: { mime_type: 'image/png', data: screenshotBase64 },
        })
      }
      parts.push({ text: msg.content })
      contents.push({ role: 'user', parts })
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] })
    }
  }

  // Add current message
  const currentParts: GeminiPart[] = []
  if (isFirstUserMessage) {
    currentParts.push({
      inline_data: { mime_type: 'image/png', data: screenshotBase64 },
    })
  }
  currentParts.push({
    text: buildUserPrompt(currentUserMessage, isFirstUserMessage),
  })
  contents.push({ role: 'user', parts: currentParts })

  // Gemini needs system prompt via system_instruction, not in contents
  void difficulty
  return contents
}

export async function streamGeminiResponse(
  screenshotBase64: string,
  messages: readonly ChatMessage[],
  currentUserMessage: string,
  difficulty: DifficultyLevel,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getApiKey()
  const contents = buildContents(
    screenshotBase64,
    messages,
    currentUserMessage,
    difficulty
  )

  const url = `${GEMINI_API_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`

  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(difficulty) }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.7,
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
      const errorBody = await response.text()
      logger.error('Gemini API error', {
        status: response.status,
        body: errorBody,
      })
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body stream')
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

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
            throw new Error(chunk.error.message)
          }

          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            fullText += text
            onChunk(text)
          }
        } catch (parseError) {
          // Skip unparseable SSE lines — happens with partial JSON
          if (
            parseError instanceof SyntaxError ||
            (parseError instanceof Error && parseError.message.includes('JSON'))
          ) {
            continue
          }
          throw parseError
        }
      }
    }

    return fullText
  } finally {
    clearTimeout(timeoutId)
  }
}
