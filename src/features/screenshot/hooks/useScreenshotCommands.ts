import { commands, type ScreenshotError } from '@/lib/tauri-bindings'
import { useScreenshotStore } from '../stores/screenshotStore'
import { logger } from '@/lib/logger'

function getScreenshotErrorMessage(error: ScreenshotError): string {
  switch (error.type) {
    case 'PermissionDenied':
      return error.message
    case 'NoMonitorFound':
      return 'No monitor found'
    case 'CaptureFailed':
      return error.message
    case 'EncodingFailed':
      return error.message
    case 'ImageTooLarge':
      return `Screenshot too large (max ${Math.round(error.max_bytes / 1024 / 1024)}MB)`
    case 'NotSupported':
      return error.message
  }
}

/**
 * Triggers a fullscreen screenshot capture.
 * Can be called from event handlers, command palette, etc.
 */
export async function captureFullscreen(): Promise<void> {
  const { setIsCapturing, setLastError, setCurrentScreenshot } =
    useScreenshotStore.getState()

  setIsCapturing(true)

  try {
    const result = await commands.captureFullscreen()

    if (result.status === 'ok') {
      setCurrentScreenshot({
        imageBase64: result.data.image_base64,
        width: result.data.width,
        height: result.data.height,
        capturedAt: result.data.captured_at,
      })
    } else {
      const errorMessage = getScreenshotErrorMessage(result.error)
      logger.error('Fullscreen capture failed', { error: result.error })
      setLastError(errorMessage)
    }
  } catch (error) {
    logger.error('Fullscreen capture threw', { error })
    setLastError('Screenshot capture failed unexpectedly')
  }
}

/**
 * Starts the area selection flow.
 */
export async function startAreaSelection(): Promise<void> {
  const { setIsCapturing, setLastError } = useScreenshotStore.getState()

  setIsCapturing(true)

  try {
    const result = await commands.startAreaSelection()

    if (result.status === 'error') {
      logger.error('Area selection failed to start', { error: result.error })
      setLastError('Failed to start area selection')
    }
    // isCapturing stays true until the selection is completed or cancelled
  } catch (error) {
    logger.error('Area selection threw', { error })
    setLastError('Failed to start area selection')
  }
}

/**
 * Checks if screen recording permission is granted.
 */
export async function checkPermission(): Promise<boolean> {
  const result = await commands.checkScreenRecordingPermission()
  if (result.status === 'ok') {
    return result.data
  }
  return false
}

/**
 * Opens the macOS Screen Recording settings pane.
 */
export async function openPermissionSettings(): Promise<void> {
  const result = await commands.openScreenRecordingSettings()
  if (result.status === 'error') {
    logger.error('Failed to open permission settings', { error: result.error })
  }
}
