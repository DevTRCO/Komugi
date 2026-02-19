import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '../stores/chatStore'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '@/store/ui-store'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Copy, Check, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ChatMessageProps {
  message: ChatMessageType
  onEditSubmit?: (messageId: string, newContent: string) => void
  editDisabled?: boolean
}

export function ChatMessage({
  message,
  onEditSubmit,
  editDisabled,
}: ChatMessageProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const isUser = message.role === 'user'

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail if window doesn't have focus
    }
  }

  const handleStartEdit = () => {
    if (editDisabled) return
    setEditContent(message.content)
    setIsEditing(true)
    // Focus textarea on next render
    setTimeout(() => editTextareaRef.current?.focus(), 0)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent('')
  }

  const handleSubmitEdit = () => {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed === message.content) {
      handleCancelEdit()
      return
    }
    onEditSubmit?.(message.id, trimmed)
    setIsEditing(false)
    setEditContent('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleScreenshotZoom = () => {
    const activeSessionId = useChatStore.getState().activeSessionId
    if (!activeSessionId) return
    useUIStore.getState().openScreenshotZoom({
      sessionId: activeSessionId,
      messageId: message.id,
    })
  }

  return (
    <div
      className={cn(
        'group px-4 py-3',
        isUser ? 'bg-muted/50' : 'bg-background'
      )}
    >
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-medium',
              isUser ? 'text-muted-foreground' : 'text-primary'
            )}
          >
            {isUser ? 'You' : 'Komugi'}
          </span>
        </div>
        {isUser && message.screenshotBase64 && (
          <div className="mb-2">
            <img
              src={`data:image/png;base64,${message.screenshotBase64}`}
              alt="Attached screenshot"
              className="h-24 max-w-[200px] cursor-zoom-in rounded border border-border object-cover"
              onClick={handleScreenshotZoom}
            />
          </div>
        )}
        {!isUser && <MarkdownRenderer content={message.content} />}
        {isUser && !isEditing && (
          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {isUser && isEditing && (
          <div className="space-y-2">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full resize-none rounded border border-border bg-background p-2 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
              rows={3}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t('chat.editHint.save')} · {t('chat.editHint.cancel')}
              </span>
            </div>
          </div>
        )}
        {isUser && !isEditing && onEditSubmit && (
          <button
            onClick={handleStartEdit}
            disabled={editDisabled}
            className="absolute top-0 right-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
            aria-label="Edit message"
          >
            <Pencil size={14} />
          </button>
        )}
        {!isUser && (
          <button
            onClick={handleCopy}
            className="absolute top-0 right-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            aria-label="Copy message"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
