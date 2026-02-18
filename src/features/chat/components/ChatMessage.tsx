import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '../stores/chatStore'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Copy, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  return (
    <div
      className={cn(
        'group relative px-4 py-3',
        isUser ? 'bg-muted/50' : 'bg-background'
      )}
    >
      <div className="mx-auto max-w-2xl">
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
              className="h-24 max-w-[200px] rounded border border-border object-cover"
            />
          </div>
        )}
        {isUser ? (
          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
        {!isUser && (
          <button
            onClick={handleCopy}
            className="absolute top-3 right-4 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            aria-label="Copy message"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
