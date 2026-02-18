import { useHistoryStore } from '../stores/historyStore'
import { useChatStore } from '@/features/chat/stores/chatStore'
import { commands } from '@/lib/tauri-bindings'
import type { StoredMessage, StoredSession } from '@/lib/tauri-bindings'
import type { ChatSession, ChatMessage } from '@/features/chat/stores/chatStore'
import { Trash2, History, Loader2 } from 'lucide-react'
import { DifficultyLevelSchema, MessageRoleSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function storedToChatMessage(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.timestamp,
    screenshotBase64: m.screenshot_base64 ?? undefined,
    screenshotWidth: m.screenshot_width ?? undefined,
    screenshotHeight: m.screenshot_height ?? undefined,
  }
}

function storedToChatSession(stored: StoredSession): ChatSession {
  const messages: readonly ChatMessage[] = stored.messages
    .filter(m => MessageRoleSchema.safeParse(m.role).success)
    .map(storedToChatMessage)

  return {
    id: stored.id,
    screenshotBase64: stored.screenshot_base64,
    screenshotWidth: stored.screenshot_width,
    screenshotHeight: stored.screenshot_height,
    difficulty:
      DifficultyLevelSchema.safeParse(stored.difficulty).data ?? 'beginner',
    createdAt: stored.created_at,
    messages,
  }
}

export function HistorySidebar() {
  const sessions = useHistoryStore(state => state.sessions)
  const isLoading = useHistoryStore(state => state.isLoading)

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Loading history...</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <History size={24} className="text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No sessions yet</p>
        <p className="text-xs text-muted-foreground/70">
          Your learning history will appear here
        </p>
      </div>
    )
  }

  const handleRestore = async (id: string) => {
    const { isGenerating } = useChatStore.getState()
    if (isGenerating) return

    // Check if already loaded in chat
    const { sessions: chatSessions } = useChatStore.getState()
    if (chatSessions.some(s => s.id === id)) {
      useChatStore.getState().switchSession(id)
      return
    }

    const result = await commands.historyLoadSession(id)
    if (result.status === 'ok') {
      const chatSession = storedToChatSession(result.data)
      useChatStore.getState().restoreSession(chatSession)
    } else {
      logger.error('Failed to load session from history', {
        error: result.error,
      })
    }
  }

  const handleRemove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const { removeSession } = useHistoryStore.getState()
    await removeSession(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium text-foreground">History</h2>
        <p className="text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map(session => (
          <button
            key={session.id}
            onClick={() => handleRestore(session.id)}
            className="group flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-start hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {session.preview}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {session.message_count} messages &middot;{' '}
                {formatDate(session.created_at)}
              </p>
            </div>
            <button
              onClick={e => handleRemove(session.id, e)}
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              aria-label="Remove session"
            >
              <Trash2 size={14} />
            </button>
          </button>
        ))}
      </div>
    </div>
  )
}
