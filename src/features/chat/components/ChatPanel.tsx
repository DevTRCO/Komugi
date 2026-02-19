import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore, selectActiveSession } from '../stores/chatStore'
import { useSendMessage } from '@/features/ai'
import { useEditMessage } from '../hooks/useEditMessage'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { StreamingMessage } from './StreamingMessage'
import { ScreenshotPreview } from './ScreenshotPreview'
import { SessionTabs } from './SessionTabs'
import { PresetPills } from './PresetPills'
import { ScreenshotDecisionBanner } from './ScreenshotDecisionBanner'
import { AlertCircle } from 'lucide-react'
import { useScreenshotStore } from '@/features/screenshot/stores/screenshotStore'
import { PermissionGuide } from '@/features/screenshot/components/PermissionGuide'

/**
 * Main chat panel component. Shows screenshot context, messages, and input.
 * Only renders when there's an active session (screenshot taken).
 */
export function ChatPanel() {
  const session = useChatStore(selectActiveSession)
  const lastError = useChatStore(state => state.lastError)
  const isGenerating = useChatStore(state => state.isGenerating)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { send, abort } = useSendMessage()
  const { editAndResend } = useEditMessage()
  const { t } = useTranslation()

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
      <SessionTabs />
      <ScreenshotPreview onClose={handleEndSession} />

      <div className="flex-1 overflow-y-auto">
        {session.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('chat.emptyState')}
            </p>
            <PresetPills onSelect={send} disabled={isGenerating} />
          </div>
        )}

        {session.messages.map(message => (
          <ChatMessage
            key={message.id}
            message={message}
            onEditSubmit={editAndResend}
            editDisabled={isGenerating}
          />
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

      <ScreenshotDecisionBanner />
      <ChatInput onSend={send} onAbort={abort} />
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  )
}

function EmptyState() {
  const lastError = useScreenshotStore(state => state.lastError)

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
        <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          <span>
            <Kbd>Cmd+Shift+9</Kbd> Fullscreen
          </span>
          <span>
            <Kbd>Cmd+Shift+0</Kbd> Select area
          </span>
          <span>
            <Kbd>Cmd+Shift+8</Kbd> Select window
          </span>
        </div>
      </div>

      {lastError && <p className="text-sm text-destructive">{lastError}</p>}

      <PermissionGuide />
    </div>
  )
}
