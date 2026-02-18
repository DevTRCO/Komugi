import { useHistoryStore } from '../stores/historyStore'
import { Trash2, History } from 'lucide-react'

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

export function HistorySidebar() {
  const sessions = useHistoryStore(state => state.sessions)

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

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const { removeSession } = useHistoryStore.getState()
    removeSession(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">History</h2>
        <p className="text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map(session => (
          <div
            key={session.id}
            className="group flex items-start gap-2 border-b border-border/50 px-4 py-3 hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {session.preview}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {session.messageCount} messages &middot;{' '}
                {formatDate(session.createdAt)}
              </p>
            </div>
            <button
              onClick={e => handleRemove(session.id, e)}
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              aria-label="Remove session"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
