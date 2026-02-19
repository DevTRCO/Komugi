import { useTranslation } from 'react-i18next'
import {
  useChatStore,
  selectActiveSession,
} from '@/features/chat/stores/chatStore'
import { useUIStore } from '@/store/ui-store'
import { ImageIcon } from 'lucide-react'

interface ScreenshotEntry {
  id: string
  base64: string
  width?: number
  height?: number
  messageId?: string
}

export function ScreenshotGallery() {
  const { t } = useTranslation()
  const session = useChatStore(selectActiveSession)

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ImageIcon size={24} className="text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {t('screenshots.emptyState')}
        </p>
      </div>
    )
  }

  const screenshots: ScreenshotEntry[] = [
    {
      id: 'session-initial',
      base64: session.screenshotBase64,
      width: session.screenshotWidth,
      height: session.screenshotHeight,
    },
  ]

  for (const msg of session.messages) {
    if (msg.screenshotBase64) {
      screenshots.push({
        id: msg.id,
        base64: msg.screenshotBase64,
        width: msg.screenshotWidth,
        height: msg.screenshotHeight,
        messageId: msg.id,
      })
    }
  }

  const handleClick = (entry: ScreenshotEntry) => {
    useUIStore.getState().openScreenshotZoom({
      sessionId: session.id,
      messageId: entry.messageId,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium text-foreground">
          {t('screenshots.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {screenshots.map((entry, index) => (
            <button
              key={entry.id}
              onClick={() => handleClick(entry)}
              className="group/thumb relative overflow-hidden rounded border border-border transition-colors hover:border-primary"
            >
              <img
                src={`data:image/png;base64,${entry.base64}`}
                alt={`Screenshot ${index + 1}`}
                className="aspect-video w-full cursor-zoom-in object-cover"
                loading="lazy"
              />
              {entry.width != null && entry.height != null && (
                <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/thumb:opacity-100">
                  {entry.width} × {entry.height}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
