import { useTranslation } from 'react-i18next'
import { useChatStore } from '../stores/chatStore'
import { MarkdownRenderer } from './MarkdownRenderer'

/**
 * Shows the in-progress streaming response from the AI.
 * Only visible when isGenerating is true and there's streaming content.
 */
export function StreamingMessage() {
  const { t } = useTranslation()
  const streamingContent = useChatStore(state => state.streamingContent)
  const isGenerating = useChatStore(state => state.isGenerating)
  const retryAttempt = useChatStore(state => state.retryAttempt)

  if (!isGenerating && !streamingContent) return null

  const showRetryIndicator = retryAttempt !== null && !streamingContent

  return (
    <div className="px-4 py-3 bg-background">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-primary">Komugi</span>
          {isGenerating && !streamingContent && (
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
            </span>
          )}
          {showRetryIndicator && (
            <span className="text-xs text-muted-foreground">
              {t('chat.retrying', { attempt: retryAttempt })}
            </span>
          )}
        </div>
        {streamingContent && (
          <div>
            <MarkdownRenderer content={streamingContent} />
            <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground/50" />
          </div>
        )}
      </div>
    </div>
  )
}
