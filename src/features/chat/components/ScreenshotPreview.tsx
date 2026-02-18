import { useChatStore } from '../stores/chatStore'
import { X } from 'lucide-react'

interface ScreenshotPreviewProps {
  onClose: () => void
}

export function ScreenshotPreview({ onClose }: ScreenshotPreviewProps) {
  const session = useChatStore(state => state.currentSession)

  if (!session) return null

  return (
    <div className="relative border-b border-border bg-muted/30 p-3">
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <img
          src={`data:image/png;base64,${session.screenshotBase64}`}
          alt="Screenshot context"
          className="h-20 w-auto max-w-[160px] rounded border border-border object-contain"
        />
        <div className="flex-1 text-xs text-muted-foreground">
          <p>
            {session.screenshotWidth} x {session.screenshotHeight}
          </p>
          <p className="mt-1">Ask a question about this screenshot.</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="End session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
