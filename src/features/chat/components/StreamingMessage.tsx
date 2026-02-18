import { useChatStore } from '../stores/chatStore'
import { MarkdownRenderer } from './MarkdownRenderer'

/**
 * Shows the in-progress streaming response from the AI.
 * Only visible when isGenerating is true and there's streaming content.
 */
export function StreamingMessage() {
  const streamingContent = useChatStore(state => state.streamingContent)
  const isGenerating = useChatStore(state => state.isGenerating)

  if (!isGenerating && !streamingContent) return null

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
