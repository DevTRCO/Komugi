import { useEffect, useMemo } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/features/chat/stores/chatStore'
import { useZoomPan } from '../hooks/useZoomPan'

interface ScreenshotZoomViewerProps {
  onClose: () => void
}

export function ScreenshotZoomViewer({ onClose }: ScreenshotZoomViewerProps) {
  const source = useUIStore(state => state.zoomedScreenshotSource)
  const activeSessionId = useChatStore(state => state.activeSessionId)
  const sessions = useChatStore(state => state.sessions)
  const { scale, translateX, translateY, reset, handlers } = useZoomPan()

  // Close zoom when session changes (RISK-7: effect, not cross-store call)
  useEffect(() => {
    return () => {
      useUIStore.getState().closeScreenshotZoom()
    }
  }, [activeSessionId])

  const resolved = useMemo(() => {
    if (!source) return null

    const session = sessions.find(s => s.id === source.sessionId)
    if (!session) return null

    if (source.messageId) {
      const message = session.messages.find(m => m.id === source.messageId)
      if (!message?.screenshotBase64) return null
      return {
        imageBase64: message.screenshotBase64,
        width: message.screenshotWidth ?? 0,
        height: message.screenshotHeight ?? 0,
      }
    }

    return {
      imageBase64: session.screenshotBase64,
      width: session.screenshotWidth,
      height: session.screenshotHeight,
    }
  }, [source, sessions])

  if (!resolved) return null

  const zoomPercent = Math.round(scale * 100)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Screenshot</p>
          <p className="text-xs text-muted-foreground">
            {resolved.width} × {resolved.height} &middot; {zoomPercent}%
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Reset zoom"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close zoom"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        {...handlers}
      >
        <img
          src={`data:image/png;base64,${resolved.imageBase64}`}
          alt="Zoomed screenshot"
          loading="lazy"
          draggable={false}
          className="h-full w-full object-contain"
          style={{
            transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  )
}
