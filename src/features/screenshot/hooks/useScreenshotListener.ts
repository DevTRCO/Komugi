import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useScreenshotStore } from '../stores/screenshotStore'
import { logger } from '@/lib/logger'

interface ScreenshotPayload {
  image_base64: string
  width: number
  height: number
  captured_at: string
}

/**
 * Listens for "screenshot-captured" events from the Rust backend
 * and updates the screenshot store.
 *
 * Mount once in the main window component tree.
 */
export function useScreenshotListener() {
  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | null = null

    listen<ScreenshotPayload>('screenshot-captured', event => {
      logger.info('Screenshot captured event received', {
        width: event.payload.width,
        height: event.payload.height,
      })

      const { setCurrentScreenshot } = useScreenshotStore.getState()
      setCurrentScreenshot({
        imageBase64: event.payload.image_base64,
        width: event.payload.width,
        height: event.payload.height,
        capturedAt: event.payload.captured_at,
      })
    })
      .then(unlistenFn => {
        if (!isMounted) {
          unlistenFn()
        } else {
          unlisten = unlistenFn
        }
      })
      .catch(error => {
        logger.error('Failed to setup screenshot-captured listener', { error })
      })

    return () => {
      isMounted = false
      if (unlisten) {
        unlisten()
      }
    }
  }, [])
}
