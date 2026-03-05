import { useEffect } from 'react'
import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import { useScreenshotStore } from '../stores/screenshotStore'
import { rgbaToScreenshotData } from '../utils/imageEncoding'
import { logger } from '@/lib/logger'

/**
 * Listens for paste events on the document.
 * If the clipboard contains an image, converts it via Canvas and feeds
 * it into the screenshot store (triggering the normal chat flow).
 * Text pastes in input fields pass through normally.
 *
 * Mount once in the main window component tree.
 */
export function useClipboardPaste(): void {
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const target = e.target
      const isTextInput =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')

      const firstFile = e.clipboardData?.files?.[0]
      const hasImage =
        firstFile !== undefined && firstFile.type.startsWith('image/')

      // Text input without image paste — let the browser handle it
      if (isTextInput && !hasImage) return

      // No image in clipboard — nothing to do
      if (!hasImage) return

      e.preventDefault()

      try {
        const image = await readImage()
        const { width, height } = await image.size()
        const rgba = await image.rgba()

        const screenshotData = rgbaToScreenshotData(rgba, width, height)

        logger.info('Clipboard image pasted', {
          width: screenshotData.width,
          height: screenshotData.height,
        })

        const { setCurrentScreenshot } = useScreenshotStore.getState()
        setCurrentScreenshot(screenshotData)
      } catch (error) {
        logger.warn('Failed to read clipboard image', { error })
      }
    }

    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [])
}
