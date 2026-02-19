import { describe, it, expect } from 'vitest'
import {
  DifficultyLevelSchema,
  MessageRoleSchema,
  SettingsPersistedSchema,
} from './schemas'

describe('DifficultyLevelSchema', () => {
  it('accepts valid levels', () => {
    expect(DifficultyLevelSchema.parse('beginner')).toBe('beginner')
    expect(DifficultyLevelSchema.parse('intermediate')).toBe('intermediate')
    expect(DifficultyLevelSchema.parse('advanced')).toBe('advanced')
  })

  it('rejects invalid strings', () => {
    expect(DifficultyLevelSchema.safeParse('expert').success).toBe(false)
    expect(DifficultyLevelSchema.safeParse('').success).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(DifficultyLevelSchema.safeParse(42).success).toBe(false)
    expect(DifficultyLevelSchema.safeParse(null).success).toBe(false)
    expect(DifficultyLevelSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('MessageRoleSchema', () => {
  it('accepts user and assistant', () => {
    expect(MessageRoleSchema.parse('user')).toBe('user')
    expect(MessageRoleSchema.parse('assistant')).toBe('assistant')
  })

  it('rejects invalid roles', () => {
    expect(MessageRoleSchema.safeParse('system').success).toBe(false)
    expect(MessageRoleSchema.safeParse('').success).toBe(false)
    expect(MessageRoleSchema.safeParse(123).success).toBe(false)
  })
})

describe('SettingsPersistedSchema', () => {
  it('accepts valid settings', () => {
    const result = SettingsPersistedSchema.safeParse({
      difficulty: 'beginner',
      apiKeyConfigured: true,
      historyRetentionDays: 30,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.difficulty).toBe('beginner')
      expect(result.data.apiKeyConfigured).toBe(true)
      expect(result.data.historyRetentionDays).toBe(30)
    }
  })

  it('rejects invalid difficulty', () => {
    const result = SettingsPersistedSchema.safeParse({
      difficulty: 'expert',
      apiKeyConfigured: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid apiKeyConfigured', () => {
    const result = SettingsPersistedSchema.safeParse({
      difficulty: 'advanced',
      apiKeyConfigured: 'yes',
    })
    expect(result.success).toBe(false)
  })

  it('partial() allows individual field validation', () => {
    const partial = SettingsPersistedSchema.partial()
    const result = partial.safeParse({ difficulty: 'advanced' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.difficulty).toBe('advanced')
      expect(result.data.apiKeyConfigured).toBeUndefined()
    }
  })

  it('partial() rejects invalid individual fields', () => {
    const partial = SettingsPersistedSchema.partial()
    const result = partial.safeParse({ difficulty: 'expert' })
    expect(result.success).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(SettingsPersistedSchema.safeParse(null).success).toBe(false)
    expect(SettingsPersistedSchema.safeParse('string').success).toBe(false)
    expect(SettingsPersistedSchema.safeParse(42).success).toBe(false)
  })
})
