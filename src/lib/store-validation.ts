import { logger } from '@/lib/logger'

const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced'])

/**
 * Validates that a value is an array where every item passes a type guard.
 * Invalid items are filtered out (not rejected entirely), and warnings are logged.
 */
export function validateArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  label: string
): readonly T[] {
  if (!Array.isArray(value)) {
    logger.warn(`Rehydration: "${label}" is not an array, using default`, {
      received: typeof value,
    })
    return []
  }

  return value.filter((item): item is T => {
    if (guard(item)) return true
    logger.warn(`Rehydration: invalid item in "${label}", skipping`, { item })
    return false
  })
}

/** Type guard for SessionSummary shape from localStorage. */
export function isSessionSummary(value: unknown): value is {
  id: string
  preview: string
  messageCount: number
  createdAt: number
} {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.preview === 'string' &&
    typeof obj.messageCount === 'number' &&
    typeof obj.createdAt === 'number'
  )
}

/** Type guard for DifficultyLevel from localStorage. */
export function isDifficultyLevel(
  value: unknown
): value is 'beginner' | 'intermediate' | 'advanced' {
  return typeof value === 'string' && VALID_DIFFICULTIES.has(value)
}
