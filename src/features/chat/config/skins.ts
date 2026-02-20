import type { ChatSkinId } from '@/lib/schemas'

interface ChatSkin {
  readonly id: ChatSkinId
  readonly nameKey: string
  readonly descriptionKey: string
  readonly preview: {
    readonly bg: string
    readonly accent: string
    readonly text: string
  }
}

export const CHAT_SKINS: readonly ChatSkin[] = [
  {
    id: 'classic',
    nameKey: 'skins.classic.name',
    descriptionKey: 'skins.classic.description',
    preview: { bg: '#1a1a1a', accent: '#e0e0e0', text: '#fafafa' },
  },
  {
    id: 'midnight',
    nameKey: 'skins.midnight.name',
    descriptionKey: 'skins.midnight.description',
    preview: { bg: '#0f0d1a', accent: '#a78bfa', text: '#e8e4f0' },
  },
  {
    id: 'paper',
    nameKey: 'skins.paper.name',
    descriptionKey: 'skins.paper.description',
    preview: { bg: '#f5f0e8', accent: '#8b7355', text: '#3d3427' },
  },
  {
    id: 'sakura',
    nameKey: 'skins.sakura.name',
    descriptionKey: 'skins.sakura.description',
    preview: { bg: '#fdf2f4', accent: '#e8729a', text: '#4a2030' },
  },
  {
    id: 'neon',
    nameKey: 'skins.neon.name',
    descriptionKey: 'skins.neon.description',
    preview: { bg: '#0a0a0a', accent: '#00d4aa', text: '#e0fff5' },
  },
] as const
