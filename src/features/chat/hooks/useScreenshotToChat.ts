import { useEffect, useRef } from 'react'
import { useScreenshotStore } from '@/features/screenshot'
import { useChatStore } from '../stores/chatStore'
import { logger } from '@/lib/logger'

/**
 * Watches the screenshot store and automatically starts a chat session
 * when a new screenshot is captured. This is the core flow connector:
 * Screenshot → Chat Session.
 *
 * Mount once in the main window component tree.
 */
export function useScreenshotToChat() {
  const prevScreenshotRef = useRef<string | null>(null)

  useEffect(() => {
    // Subscribe to screenshot store changes
    const unsubscribe = useScreenshotStore.subscribe(state => {
      const screenshot = state.currentScreenshot
      if (!screenshot) return

      // Only start a new session if this is a different screenshot
      if (screenshot.capturedAt === prevScreenshotRef.current) return
      prevScreenshotRef.current = screenshot.capturedAt

      logger.info('New screenshot detected, starting chat session', {
        width: screenshot.width,
        height: screenshot.height,
      })

      const { startSession } = useChatStore.getState()
      startSession({
        imageBase64: screenshot.imageBase64,
        width: screenshot.width,
        height: screenshot.height,
      })

      // Free the duplicate base64 from screenshot store (CAUT-1)
      const { clearScreenshot } = useScreenshotStore.getState()
      clearScreenshot()
    })

    return unsubscribe
  }, [])
}
