import { useChatStore } from '../stores/chatStore'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact session tabs shown when multiple sessions exist.
 * Each tab shows a tiny screenshot thumbnail. Click to switch, X to close.
 */
export function SessionTabs() {
  const sessions = useChatStore(state => state.sessions)
  const activeSessionId = useChatStore(state => state.activeSessionId)
  const isGenerating = useChatStore(state => state.isGenerating)

  // Don't show tabs if there's only one or no session
  if (sessions.length <= 1) return null

  const handleSwitch = (id: string) => {
    if (isGenerating) return
    useChatStore.getState().switchSession(id)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    useChatStore.getState().deleteSession(id)
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1.5">
      {sessions.map(session => {
        const isActive = session.id === activeSessionId
        const messageCount = session.messages.length
        const firstUserMsg = session.messages.find(m => m.role === 'user')
        const preview = firstUserMsg
          ? firstUserMsg.content.slice(0, 30) +
            (firstUserMsg.content.length > 30 ? '...' : '')
          : 'New'

        return (
          <button
            key={session.id}
            onClick={() => handleSwitch(session.id)}
            disabled={isGenerating && !isActive}
            className={cn(
              'group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <img
              src={`data:image/png;base64,${session.screenshotBase64}`}
              alt=""
              className="h-5 w-8 rounded-sm border border-border/50 object-cover"
            />
            <span className="max-w-[120px] truncate">{preview}</span>
            {messageCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({messageCount})
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={e => handleDelete(e, session.id)}
              onKeyDown={e => {
                if (e.key === 'Enter')
                  handleDelete(e as unknown as React.MouseEvent, session.id)
              }}
              className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
              aria-label="Close session"
            >
              <X size={10} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
