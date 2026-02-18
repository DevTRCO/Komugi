import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSendMessage } from '@/features/ai'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { StreamingMessage } from './StreamingMessage'
import { ScreenshotPreview } from './ScreenshotPreview'
import { AlertCircle } from 'lucide-react'

/**
 * Main chat panel component. Shows screenshot context, messages, and input.
 * Only renders when there's an active session (screenshot taken).
 */
export function ChatPanel() {
  const session = useChatStore(state => state.currentSession)
  const lastError = useChatStore(state => state.lastError)
  const isGenerating = useChatStore(state => state.isGenerating)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { send, abort } = useSendMessage()

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages.length, isGenerating])

  if (!session) {
    return <EmptyState />
  }

  const handleEndSession = () => {
    const { endSession } = useChatStore.getState()
    endSession()
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenshotPreview onClose={handleEndSession} />

      <div className="flex-1 overflow-y-auto">
        {session.messages.length === 0 && (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            <p>What do you want to understand about this screenshot?</p>
          </div>
        )}

        {session.messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}

        <StreamingMessage />

        {lastError && (
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{lastError}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={send} onAbort={abort} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Take a screenshot to start
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use{' '}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
            Cmd+Shift+1
          </kbd>{' '}
          for fullscreen or{' '}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
            Cmd+Shift+2
          </kbd>{' '}
          to select an area.
        </p>
      </div>
    </div>
  )
}
