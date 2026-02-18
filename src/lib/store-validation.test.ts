import { describe, it, expect, vi } from 'vitest'
import {
  validateArray,
  isSessionSummary,
  isDifficultyLevel,
} from './store-validation'

// Mock the logger to avoid console noise in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

describe('isSessionSummary', () => {
  it('accepts a valid session summary', () => {
    expect(
      isSessionSummary({
        id: 'abc-123',
        preview: 'What is this error?',
        messageCount: 4,
        createdAt: 1700000000000,
      })
    ).toBe(true)
  })

  it('rejects missing id', () => {
    expect(
      isSessionSummary({
        preview: 'text',
        messageCount: 2,
        createdAt: 1700000000000,
      })
    ).toBe(false)
  })

  it('rejects wrong type for messageCount', () => {
    expect(
      isSessionSummary({
        id: 'abc',
        preview: 'text',
        messageCount: '4',
        createdAt: 1700000000000,
      })
    ).toBe(false)
  })

  it('rejects null', () => {
    expect(isSessionSummary(null)).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isSessionSummary('string')).toBe(false)
    expect(isSessionSummary(42)).toBe(false)
    expect(isSessionSummary(undefined)).toBe(false)
  })
})

describe('isDifficultyLevel', () => {
  it('accepts beginner', () => {
    expect(isDifficultyLevel('beginner')).toBe(true)
  })

  it('accepts intermediate', () => {
    expect(isDifficultyLevel('intermediate')).toBe(true)
  })

  it('accepts advanced', () => {
    expect(isDifficultyLevel('advanced')).toBe(true)
  })

  it('rejects invalid strings', () => {
    expect(isDifficultyLevel('expert')).toBe(false)
    expect(isDifficultyLevel('')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isDifficultyLevel(42)).toBe(false)
    expect(isDifficultyLevel(null)).toBe(false)
    expect(isDifficultyLevel(undefined)).toBe(false)
  })
})

describe('validateArray', () => {
  const isNumber = (v: unknown): v is number => typeof v === 'number'

  it('returns validated items from a valid array', () => {
    expect(validateArray([1, 2, 3], isNumber, 'test')).toEqual([1, 2, 3])
  })

  it('filters out invalid items and keeps valid ones', () => {
    expect(validateArray([1, 'two', 3, null], isNumber, 'test')).toEqual([1, 3])
  })

  it('returns empty array for non-array input', () => {
    expect(validateArray('not-array', isNumber, 'test')).toEqual([])
    expect(validateArray(null, isNumber, 'test')).toEqual([])
    expect(validateArray(undefined, isNumber, 'test')).toEqual([])
    expect(validateArray(42, isNumber, 'test')).toEqual([])
  })

  it('returns empty array when all items are invalid', () => {
    expect(validateArray(['a', 'b', 'c'], isNumber, 'test')).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    expect(validateArray([], isNumber, 'test')).toEqual([])
  })
})
