import { logger } from '@/lib/logger'
import type {
  ChatMessage,
  DifficultyLevel,
  ScreenshotAttachment,
} from '@/features/chat/stores/chatStore'
import { buildSystemPrompt, buildUserPrompt } from '../config/prompts'
import { getApiKey } from './api-key'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = 600_000

type ModelTier = 'pro' | 'flash'

interface ModelConfig {
  readonly model: string
  readonly maxOutputTokens: number
  readonly thinkingLevel: string | null
  readonly retryThinkingLevel: string | null
}

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  pro: {
    model: 'gemini-3.1-pro-preview',
    maxOutputTokens: 65_536,
    thinkingLevel: 'medium',
    retryThinkingLevel: 'low',
  },
  flash: {
    model: 'gemini-3.1-flash-lite-preview',
    maxOutputTokens: 65_536,
    thinkingLevel: 'low',
    retryThinkingLevel: null,
  },
} as const
const MAX_RETRIES = 2
const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
const RATE_LIMIT_BACKOFF_MS = 15_000

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

function selectModelTier(
  isFirstMessage: boolean,
  hasNewScreenshot: boolean
): ModelTier {
  if (isFirstMessage || hasNewScreenshot) return 'pro'
  return 'flash'
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

function getUserFacingError(status: number, apiError?: string): string {
  switch (status) {
    case 400: {
      const detail = extractApiErrorMessage(apiError)
      return detail
        ? `Request failed: ${detail}`
        : 'Invalid request. The message or screenshot may be too large.'
    }
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

function extractApiErrorMessage(body?: string): string | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message ?? null
  } catch {
    return null
  }
}

// --- Retry infrastructure ---

interface HttpError extends Error {
  retryable: boolean
  httpStatus: number
}

function createHttpError(status: number, apiError?: string): HttpError {
  const error = new Error(getUserFacingError(status, apiError)) as HttpError
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
  apiKey: string
  body: Record<string, unknown>
  modelName: string
  onChunk: (text: string) => void
  signal?: AbortSignal
}

async function singleStreamAttempt(
  options: StreamAttemptOptions
): Promise<StreamResult> {
  const { url, apiKey, body, modelName, onChunk, signal } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const jsonBody = JSON.stringify(body)
    logger.info('Gemini request', {
      payloadBytes: jsonBody.length,
      model: modelName,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: jsonBody,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, 500)
      logger.error('Gemini API error', {
        status: response.status,
        body: errorBody,
      })
      throw createHttpError(response.status, errorBody)
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
  apiKey: string
  contents: GeminiContent[]
  difficulty: DifficultyLevel
  config: ModelConfig
  onChunk: (text: string) => void
  onRetry?: (attempt: number) => void
  signal?: AbortSignal
  profileSummary?: string
}

async function executeWithRetry(options: RetryOptions): Promise<StreamResult> {
  const {
    url,
    apiKey,
    contents,
    difficulty,
    config,
    onChunk,
    onRetry,
    signal,
    profileSummary,
  } = options

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = buildRequestBody(
        contents,
        difficulty,
        config,
        attempt > 0,
        profileSummary
      )
      return await singleStreamAttempt({
        url,
        apiKey,
        body,
        modelName: config.model,
        onChunk,
        signal,
      })
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
  config: ModelConfig,
  isRetry: boolean,
  profileSummary?: string
): Record<string, unknown> {
  const thinkingLevel = isRetry
    ? config.retryThinkingLevel
    : config.thinkingLevel

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: config.maxOutputTokens,
  }
  if (thinkingLevel !== null) {
    generationConfig.thinkingConfig = { thinkingLevel }
  }

  return {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(difficulty, profileSummary) }],
    },
    contents,
    generationConfig,
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
  onRetry?: (attempt: number) => void,
  profileSummary?: string
): Promise<StreamResult> {
  const apiKey = await getApiKey()
  const contents = buildContents(
    screenshotBase64,
    messages,
    currentUserMessage,
    currentMessageScreenshot
  )

  const isFirstMessage = !messages.some(m => m.role === 'user')
  const hasNewScreenshot = !!currentMessageScreenshot
  const tier = selectModelTier(isFirstMessage, hasNewScreenshot)
  const config = MODEL_CONFIGS[tier]

  logger.info('Model selected', { tier, model: config.model })

  const url = `${GEMINI_API_BASE}/models/${config.model}:streamGenerateContent?alt=sse`

  return executeWithRetry({
    url,
    apiKey,
    contents,
    difficulty,
    config,
    onChunk,
    onRetry,
    signal,
    profileSummary,
  })
}

export { selectModelTier, buildRequestBody, MODEL_CONFIGS }
export type { ModelTier, ModelConfig }
