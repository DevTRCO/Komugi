import { useEffect, useRef } from 'react'
import { useScreenshotStore } from '@/features/screenshot'
import {
  useChatStore,
  selectActiveSession,
  selectCanAddScreenshot,
} from '../stores/chatStore'
import { logger } from '@/lib/logger'

export function useScreenshotToChat() {
  const prevScreenshotRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = useScreenshotStore.subscribe(state => {
      const screenshot = state.currentScreenshot
      if (!screenshot) return
      if (screenshot.capturedAt === prevScreenshotRef.current) return
      prevScreenshotRef.current = screenshot.capturedAt

      const chatState = useChatStore.getState()
      const activeSession = selectActiveSession(chatState)
      const canAdd = selectCanAddScreenshot(chatState)

      const screenshotData = {
        imageBase64: screenshot.imageBase64,
        width: screenshot.width,
        height: screenshot.height,
      }

      useScreenshotStore.getState().clearScreenshot()

      if (!activeSession || !canAdd) {
        logger.info('New screenshot: starting new session')
        chatState.startSession(screenshotData)
        return
      }

      logger.info('New screenshot: showing decision banner')
      chatState.setPendingScreenshot(screenshotData)
    })

    return unsubscribe
  }, [])
}
