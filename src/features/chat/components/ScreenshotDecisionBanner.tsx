import { useTranslation } from 'react-i18next'
import { ImagePlus, Plus, X } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

export function ScreenshotDecisionBanner() {
  const pendingScreenshot = useChatStore(state => state.pendingScreenshot)
  const screenshotDecisionPending = useChatStore(
    state => state.screenshotDecisionPending
  )
  const { t } = useTranslation()

  if (!screenshotDecisionPending || !pendingScreenshot) return null

  const handleAddToSession = () => {
    useChatStore.getState().setScreenshotDecisionPending(false)
  }

  const handleNewTopic = () => {
    const { startSession, clearPendingScreenshot } = useChatStore.getState()
    startSession(pendingScreenshot)
    clearPendingScreenshot()
  }

  const handleDismiss = () => {
    useChatStore.getState().clearPendingScreenshot()
  }

  return (
    <div className="border-t border-border bg-muted/50 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
          <img
            src={`data:image/png;base64,${pendingScreenshot.imageBase64}`}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t('screenshot.decision.title')}
          </p>
          <div className="mt-1 flex gap-2">
            <button
              onClick={handleAddToSession}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ImagePlus size={12} />
              {t('screenshot.decision.addToSession')}
            </button>
            <button
              onClick={handleNewTopic}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus size={12} />
              {t('screenshot.decision.newTopic')}
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
