import { logger } from '@/lib/logger'
import { commands } from '@/lib/tauri-bindings'
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
const REQUEST_TIMEOUT_MS = 600_000
const MAX_RETRIES = 2
const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
const RATE_LIMIT_BACKOFF_MS = 15_000
const RETRY_THINKING_BUDGET = 2_048

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

async function loadKeyFromKeychain(): Promise<string | null> {
  const result = await commands.loadApiKey()
  if (result.status === 'ok') return result.data ?? null
  logger.warn('Keychain load failed', { error: result.error })
  return null
}

async function getApiKey(): Promise<string> {
  const keychainKey = await loadKeyFromKeychain()
  if (keychainKey) return keychainKey

  throw new Error('No API key configured. Add one in Preferences → Advanced.')
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
      return 'API key is invalid or expired. Check your key in Preferences → Advanced.'
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

// --- Retry infrastructure ---

interface HttpError extends Error {
  retryable: boolean
  httpStatus: number
}

function createHttpError(status: number): HttpError {
  const error = new Error(getUserFacingError(status)) as HttpError
  error.httpStatus = status
  error.retryable = status === 429 || status >= 500
  return error
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && 'httpStatus' in error && 'retryable' in error
}

class TimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'TimeoutError'
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false
  if (isHttpError(error)) return error.retryable
  if (error instanceof TimeoutError) return true
  if (error instanceof TypeError) return true
  return false
}

function isRateLimitError(error: unknown): boolean {
  return isHttpError(error) && error.httpStatus === 429
}

function calculateBackoffMs(attempt: number, isRateLimit: boolean): number {
  const base = isRateLimit ? RATE_LIMIT_BACKOFF_MS : INITIAL_BACKOFF_MS
  const exponential = base * Math.pow(2, attempt)
  const capped = Math.min(exponential, MAX_BACKOFF_MS)
  const jitter = 0.5 + Math.random()
  return Math.round(capped * jitter)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
] as const

interface ChunkResult {
  text: string
  finishReason: string | null
}

/** Extracts visible text and finish reason from a single SSE chunk. */
function extractChunkContent(chunk: GeminiStreamChunk): ChunkResult {
  if (chunk.error) {
    const msg =
      typeof chunk.error.message === 'string'
        ? chunk.error.message
        : 'Gemini API returned an error'
    throw new Error(msg)
  }

  const candidate = chunk.candidates?.[0]
  const parts = candidate?.content?.parts ?? []

  let text = ''
  for (const part of parts) {
    if (part.thought) continue
    if (part.text) text += part.text
  }

  return { text, finishReason: candidate?.finishReason ?? null }
}

/** Parses a single SSE data line, returning null for non-data or unparseable lines. */
function parseSseLine(line: string): GeminiStreamChunk | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  if (!data || data === '[DONE]') return null
  return JSON.parse(data) as GeminiStreamChunk
}

/** Reads an SSE stream and yields text chunks to the callback. */
async function consumeSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (text: string) => void
): Promise<StreamResult> {
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  let finishReason: string | null = null
  let skippedChunks = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const result = processOneSseLine(line)
      if (!result) continue

      if (result.skipped) {
        skippedChunks++
        continue
      }

      if (result.text) {
        fullText += result.text
        onChunk(result.text)
      }
      if (result.finishReason) finishReason = result.finishReason
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
}

interface SseLineResult {
  text: string
  finishReason: string | null
  skipped: boolean
}

/** Processes a single SSE line, returning null for non-data lines. */
function processOneSseLine(line: string): SseLineResult | null {
  try {
    const chunk = parseSseLine(line)
    if (!chunk) return null
    return { ...extractChunkContent(chunk), skipped: false }
  } catch (error) {
    if (error instanceof SyntaxError)
      return { text: '', finishReason: null, skipped: true }
    throw error
  }
}

interface StreamAttemptOptions {
  url: string
  body: Record<string, unknown>
  onChunk: (text: string) => void
  signal?: AbortSignal
}

async function singleStreamAttempt(
  options: StreamAttemptOptions
): Promise<StreamResult> {
  const { url, body, onChunk, signal } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

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
      throw createHttpError(response.status)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body stream')

    return await consumeSseStream(reader, onChunk)
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (controller.signal.aborted) throw new TimeoutError()
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

interface RetryOptions {
  url: string
  contents: GeminiContent[]
  difficulty: DifficultyLevel
  onChunk: (text: string) => void
  onRetry?: (attempt: number) => void
  signal?: AbortSignal
}

async function executeWithRetry(options: RetryOptions): Promise<StreamResult> {
  const { url, contents, difficulty, onChunk, onRetry, signal } = options

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const thinkingBudget =
        attempt === 0 ? THINKING_BUDGET : RETRY_THINKING_BUDGET
      const body = buildRequestBody(contents, difficulty, thinkingBudget)
      return await singleStreamAttempt({ url, body, onChunk, signal })
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES
      if (isLastAttempt || !isRetryableError(error)) throw error

      const backoff = calculateBackoffMs(attempt, isRateLimitError(error))
      logger.warn('Retrying Gemini request', {
        attempt: attempt + 1,
        backoffMs: backoff,
        error: error instanceof Error ? error.message : String(error),
      })
      onRetry?.(attempt + 1)
      await sleep(backoff, signal)
    }
  }

  throw new Error('Retry loop exhausted')
}

function buildRequestBody(
  contents: GeminiContent[],
  difficulty: DifficultyLevel,
  thinkingBudget: number = THINKING_BUDGET
): Record<string, unknown> {
  return {
    system_instruction: { parts: [{ text: buildSystemPrompt(difficulty) }] },
    contents,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget },
    },
    safetySettings: SAFETY_SETTINGS,
  }
}

export async function streamGeminiResponse(
  screenshotBase64: string,
  messages: readonly ChatMessage[],
  currentUserMessage: string,
  difficulty: DifficultyLevel,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  currentMessageScreenshot?: ScreenshotAttachment,
  onRetry?: (attempt: number) => void
): Promise<StreamResult> {
  const apiKey = await getApiKey()
  const contents = buildContents(
    screenshotBase64,
    messages,
    currentUserMessage,
    currentMessageScreenshot
  )

  const url = `${GEMINI_API_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`

  return executeWithRetry({
    url,
    contents,
    difficulty,
    onChunk,
    onRetry,
    signal,
  })
}
