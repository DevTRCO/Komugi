import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ScreenshotData {
  imageBase64: string
  width: number
  height: number
  capturedAt: string
}

interface ScreenshotState {
  /** The current screenshot (null if none captured yet) */
  currentScreenshot: ScreenshotData | null
  /** Whether a capture is currently in progress */
  isCapturing: boolean
  /** Error message from the last capture attempt */
  lastError: string | null

  setCurrentScreenshot: (screenshot: ScreenshotData) => void
  clearScreenshot: () => void
  setIsCapturing: (capturing: boolean) => void
  setLastError: (error: string | null) => void
}

export const useScreenshotStore = create<ScreenshotState>()(
  devtools(
    set => ({
      currentScreenshot: null,
      isCapturing: false,
      lastError: null,

      setCurrentScreenshot: screenshot =>
        set(
          { currentScreenshot: screenshot, isCapturing: false, lastError: null },
          undefined,
          'setCurrentScreenshot'
        ),

      clearScreenshot: () =>
        set({ currentScreenshot: null }, undefined, 'clearScreenshot'),

      setIsCapturing: capturing =>
        set({ isCapturing: capturing }, undefined, 'setIsCapturing'),

      setLastError: error =>
        set({ lastError: error, isCapturing: false }, undefined, 'setLastError'),
    }),
    { name: 'screenshot-store' }
  )
)
