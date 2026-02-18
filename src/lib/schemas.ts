import { z } from 'zod'

export const DifficultyLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
])
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>

export const MessageRoleSchema = z.enum(['user', 'assistant'])
export type MessageRole = z.infer<typeof MessageRoleSchema>

export const SettingsPersistedSchema = z.object({
  difficulty: DifficultyLevelSchema,
  apiKeyConfigured: z.boolean(),
})
