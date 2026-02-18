import { commands } from '@/lib/tauri-bindings'
import { useScreenshotStore } from '../stores/screenshotStore'
import { logger } from '@/lib/logger'

/**
 * Triggers a fullscreen screenshot capture.
 * Can be called from event handlers, command palette, etc.
 */
export async function captureFullscreen(): Promise<void> {
  const { setIsCapturing, setLastError, setCurrentScreenshot } =
    useScreenshotStore.getState()

  setIsCapturing(true)

  const result = await commands.captureFullscreen()

  if (result.status === 'ok') {
    setCurrentScreenshot({
      imageBase64: result.data.image_base64,
      width: result.data.width,
      height: result.data.height,
      capturedAt: result.data.captured_at,
    })
  } else {
    const errorMessage =
      typeof result.error === 'string'
        ? result.error
        : 'message' in result.error
          ? result.error.message
          : 'Screenshot capture failed'
    logger.error('Fullscreen capture failed', { error: result.error })
    setLastError(errorMessage)
  }
}

/**
 * Starts the area selection flow.
 */
export async function startAreaSelection(): Promise<void> {
  const { setIsCapturing, setLastError } = useScreenshotStore.getState()

  setIsCapturing(true)

  const result = await commands.startAreaSelection()

  if (result.status === 'error') {
    logger.error('Area selection failed to start', { error: result.error })
    setLastError('Failed to start area selection')
  }
  // isCapturing stays true until the selection is completed or cancelled
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
