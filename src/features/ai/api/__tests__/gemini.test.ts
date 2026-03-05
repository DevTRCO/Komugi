import { describe, it, expect } from 'vitest'
import { selectModelTier, buildRequestBody, MODEL_CONFIGS } from '../gemini'

describe('selectModelTier', () => {
  it('returns pro for first message', () => {
    expect(selectModelTier(true, false)).toBe('pro')
  })

  it('returns pro when new screenshot is attached', () => {
    expect(selectModelTier(false, true)).toBe('pro')
  })

  it('returns pro when both first message and new screenshot', () => {
    expect(selectModelTier(true, true)).toBe('pro')
  })

  it('returns flash for follow-up without new screenshot', () => {
    expect(selectModelTier(false, false)).toBe('flash')
  })
})

describe('buildRequestBody', () => {
  const dummyContents = [{ role: 'user' as const, parts: [{ text: 'hello' }] }]

  it('includes thinkingConfig for Pro initial request', () => {
    const body = buildRequestBody(
      dummyContents,
      'beginner',
      MODEL_CONFIGS.pro,
      false
    )
    const gen = body.generationConfig as Record<string, unknown>
    expect(gen.thinkingConfig).toEqual({ thinkingLevel: 'medium' })
  })

  it('includes thinkingConfig with retry level for Pro retry', () => {
    const body = buildRequestBody(
      dummyContents,
      'beginner',
      MODEL_CONFIGS.pro,
      true
    )
    const gen = body.generationConfig as Record<string, unknown>
    expect(gen.thinkingConfig).toEqual({ thinkingLevel: 'low' })
  })

  it('includes thinkingConfig for Flash initial request', () => {
    const body = buildRequestBody(
      dummyContents,
      'beginner',
      MODEL_CONFIGS.flash,
      false
    )
    const gen = body.generationConfig as Record<string, unknown>
    expect(gen.thinkingConfig).toEqual({ thinkingLevel: 'low' })
  })

  it('omits thinkingConfig for Flash retry (null retryThinkingLevel)', () => {
    const body = buildRequestBody(
      dummyContents,
      'beginner',
      MODEL_CONFIGS.flash,
      true
    )
    const gen = body.generationConfig as Record<string, unknown>
    expect(gen.thinkingConfig).toBeUndefined()
  })

  it('always includes maxOutputTokens', () => {
    const body = buildRequestBody(
      dummyContents,
      'beginner',
      MODEL_CONFIGS.flash,
      true
    )
    const gen = body.generationConfig as Record<string, unknown>
    expect(gen.maxOutputTokens).toBe(65_536)
  })
})
