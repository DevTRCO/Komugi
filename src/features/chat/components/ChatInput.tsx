import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, X, ImageIcon } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

interface ChatInputProps {
  onSend: (message: string) => void
  onAbort: () => void
}

const MAX_MESSAGE_LENGTH = 4000

export function ChatInput({ onSend, onAbort }: ChatInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isGenerating = useChatStore(state => state.isGenerating)
  const pendingScreenshot = useChatStore(state => state.pendingScreenshot)
  const screenshotDecisionPending = useChatStore(
    state => state.screenshotDecisionPending
  )
  const { t } = useTranslation()
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH
  const showPendingPreview =
    pendingScreenshot !== null && !screenshotDecisionPending

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [text])

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || isGenerating || isOverLimit) return
    onSend(trimmed)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="mx-auto max-w-2xl">
        {showPendingPreview && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
            <ImageIcon size={14} className="shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {t('screenshot.decision.pendingHint')}
            </span>
            <button
              onClick={() => useChatStore.getState().clearPendingScreenshot()}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Remove pending screenshot"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {isOverLimit && (
          <p className="mb-1 text-xs text-destructive">
            Message too long ({text.length}/{MAX_MESSAGE_LENGTH})
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about what you see..."
            maxLength={MAX_MESSAGE_LENGTH + 100}
            rows={1}
            disabled={isGenerating}
            className="min-h-[36px] flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          />
          {isGenerating ? (
            <button
              onClick={onAbort}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
              aria-label="Stop generating"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || isOverLimit}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
