import { logger } from '@/lib/logger'
import type {
  ChatMessage,
  DifficultyLevel,
} from '@/features/chat/stores/chatStore'
import { getApiKey } from './api-key'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const SUMMARY_MODEL = 'gemini-3.1-flash-lite-preview'
const SUMMARY_TIMEOUT_MS = 30_000
const MAX_OUTPUT_TOKENS = 256

const SUMMARY_PROMPT = `Analyze this tutoring session. Summarize in 1-3 sentences what topics were studied, what the user understood well, and what they struggled with.
Extract 1-5 topic tags (lowercase, single words or short phrases).

Respond with JSON matching this schema:
{
  "summary": "1-3 sentence summary",
  "topics": ["tag1", "tag2"]
}`

interface SummaryResponse {
  summary: string
  topics: string[]
}

interface GeminiGenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
  }[]
}

function buildSummaryMessages(
  messages: readonly ChatMessage[],
  difficulty: DifficultyLevel
): string {
  const lines = [`Session difficulty: ${difficulty}`, '']
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'Student' : 'Tutor'
    lines.push(`${role}: ${msg.content}`)
  }
  return lines.join('\n')
}

function parseSummaryResponse(text: string): SummaryResponse | null {
  try {
    const parsed = JSON.parse(text) as SummaryResponse
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.topics)) {
      return null
    }
    return {
      summary: parsed.summary.slice(0, 2000),
      topics: parsed.topics
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 5)
        .map(t => t.toLowerCase().slice(0, 50)),
    }
  } catch {
    return null
  }
}

/**
 * Generates a session summary using Flash Lite (non-streaming, text-only).
 * Returns null on ANY error — never throws.
 */
export async function generateSessionSummary(
  messages: readonly ChatMessage[],
  difficulty: DifficultyLevel,
  signal?: AbortSignal
): Promise<SummaryResponse | null> {
  try {
    const apiKey = await getApiKey()
    const sessionText = buildSummaryMessages(messages, difficulty)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const url = `${GEMINI_API_BASE}/models/${SUMMARY_MODEL}:generateContent`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SUMMARY_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: sessionText }] }],
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        logger.warn('Summary API returned error', { status: response.status })
        return null
      }

      const data = (await response.json()) as GeminiGenerateResponse
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        logger.warn('Summary API returned empty response')
        return null
      }

      return parseSummaryResponse(text)
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
    }
  } catch (error) {
    logger.warn('Session summary generation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
