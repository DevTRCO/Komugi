import type { ScreenshotData } from '../stores/screenshotStore'

const MAX_SCREENSHOT_EDGE = 1568
const MAX_INPUT_DIMENSION = 16000
const RGBA_BYTES_PER_PIXEL = 4

/**
 * Converts raw RGBA pixel data to a resized PNG base64 ScreenshotData
 * using an offscreen Canvas. Resizes if the longest edge exceeds 1568px
 * (matching the Rust-side Gemini limit).
 *
 * Validates dimensions and buffer length before processing.
 */
export function rgbaToScreenshotData(
  rgba: Uint8Array,
  width: number,
  height: number
): ScreenshotData {
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`)
  }
  if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION) {
    throw new Error(
      `Image exceeds max dimension: ${width}x${height} (limit ${MAX_INPUT_DIMENSION}px)`
    )
  }

  const expectedBytes = width * height * RGBA_BYTES_PER_PIXEL
  if (rgba.length !== expectedBytes) {
    throw new Error(
      `RGBA buffer mismatch: expected ${expectedBytes} bytes for ${width}x${height}, got ${rgba.length}`
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas 2d context')

  const clampedData = new Uint8ClampedArray(rgba.length)
  clampedData.set(rgba)
  const imageData = new ImageData(clampedData, width, height)
  ctx.putImageData(imageData, 0, 0)

  const resized = resizeCanvas(canvas, MAX_SCREENSHOT_EDGE)

  const dataUrl = resized.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1] ?? ''

  return {
    imageBase64: base64,
    width: resized.width,
    height: resized.height,
    capturedAt: String(Math.floor(Date.now() / 1000)),
  }
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  maxEdge: number
): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height)
  if (longest <= maxEdge) return canvas

  const scale = maxEdge / longest
  const resized = document.createElement('canvas')
  resized.width = Math.round(canvas.width * scale)
  resized.height = Math.round(canvas.height * scale)
  const ctx = resized.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas 2d context for resize')

  ctx.drawImage(canvas, 0, 0, resized.width, resized.height)
  return resized
}
