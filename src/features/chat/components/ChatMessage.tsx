import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '../stores/chatStore'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
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
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {message.content}
        </div>
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
