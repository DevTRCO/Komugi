import { z } from 'zod'

export const DifficultyLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
])
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>

export const ChatSkinSchema = z.enum([
  'classic',
  'midnight',
  'paper',
  'sakura',
  'neon',
])
export type ChatSkinId = z.infer<typeof ChatSkinSchema>

export const MessageRoleSchema = z.enum(['user', 'assistant'])
export type MessageRole = z.infer<typeof MessageRoleSchema>

export const SettingsPersistedSchema = z.object({
  difficulty: DifficultyLevelSchema,
  apiKeyConfigured: z.boolean(),
  historyRetentionDays: z.number().int().min(0).max(365),
  chatSkin: ChatSkinSchema,
})
