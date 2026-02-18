import { useCallback, useEffect, useRef, useState } from 'react'
import { commands, type WindowBounds } from '@/lib/tauri-bindings'

// ============================================================================
// URL Params (shared between both overlays)
// ============================================================================

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode') ?? 'area'
const scaleParam = params.get('scale')
const scale = scaleParam ? parseFloat(scaleParam) : window.devicePixelRatio

// ============================================================================
// Area Selection Overlay (existing behavior)
// ============================================================================

interface SelectionRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

function AreaSelectionOverlay() {
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleCancel = useCallback(async () => {
    await commands.cancelAreaSelection()
  }, [])

  const handleComplete = useCallback(
    async (rect: SelectionRect) => {
      const x = Math.min(rect.startX, rect.endX)
      const y = Math.min(rect.startY, rect.endY)
      const width = Math.abs(rect.endX - rect.startX)
      const height = Math.abs(rect.endY - rect.startY)

      if (width < 10 || height < 10) {
        await handleCancel()
        return
      }

      await commands.completeAreaSelection(
        Math.round(x * scale),
        Math.round(y * scale),
        Math.round(width * scale),
        Math.round(height * scale)
      )
    },
    [handleCancel]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCancel])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setSelection({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
    })
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setSelection(prev =>
        prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null
      )
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !selection) return
    setIsDragging(false)
    handleComplete(selection)
  }, [isDragging, selection, handleComplete])

  const rect = selection
    ? {
        left: Math.min(selection.startX, selection.endX),
        top: Math.min(selection.startY, selection.endY),
        width: Math.abs(selection.endX - selection.startX),
        height: Math.abs(selection.endY - selection.startY),
      }
    : null

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.3)',
        userSelect: 'none',
      }}
    >
      {rect && rect.width > 0 && rect.height > 0 && (
        <div
          style={{
            position: 'absolute',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            border: '2px dashed rgba(255, 255, 255, 0.8)',
            background: 'rgba(255, 255, 255, 0.05)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Window Selection Overlay (new)
// ============================================================================

function WindowSelectionOverlay() {
  const [windows, setWindows] = useState<WindowBounds[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Load window bounds on mount
  useEffect(() => {
    async function loadWindows() {
      const result = await commands.getPendingWindowBounds()
      if (result.status === 'ok') {
        setWindows(result.data)
      }
    }
    loadWindows()
  }, [])

  const handleCancel = useCallback(async () => {
    await commands.cancelAreaSelection()
  }, [])

  // Escape key cancels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCancel])

  // Hit-test cursor against window rects (front-to-back order)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const mx = e.clientX
      const my = e.clientY

      for (let i = 0; i < windows.length; i++) {
        const win = windows[i]
        if (!win) continue
        if (
          mx >= win.x &&
          mx <= win.x + win.width &&
          my >= win.y &&
          my <= win.y + win.height
        ) {
          setHoveredIndex(i)
          return
        }
      }
      setHoveredIndex(null)
    },
    [windows]
  )

  // Click captures the hovered window's region
  const handleClick = useCallback(async () => {
    if (hoveredIndex === null) return
    const win = windows[hoveredIndex]
    if (!win) return

    await commands.completeAreaSelection(
      Math.round(win.x * scale),
      Math.round(win.y * scale),
      Math.round(win.width * scale),
      Math.round(win.height * scale)
    )
  }, [hoveredIndex, windows])

  const hovered = hoveredIndex !== null ? windows[hoveredIndex] : null

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.3)',
        userSelect: 'none',
      }}
    >
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: hovered.x,
            top: hovered.y,
            width: hovered.width,
            height: hovered.height,
            border: '2px solid rgba(59, 130, 246, 0.9)',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: 8,
            pointerEvents: 'none',
            transition: 'all 80ms ease-out',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -24,
              left: 0,
              background: 'rgba(59, 130, 246, 0.9)',
              color: 'white',
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {hovered.owner_name}
            {hovered.window_name ? ` — ${hovered.window_name}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Root: delegates to the correct overlay based on URL mode param
// ============================================================================

/**
 * Fullscreen transparent overlay for screenshot selection.
 * Mode is determined by the `mode` URL query param:
 * - "area" (default): user draws a rectangle
 * - "window": user hovers and clicks a window
 */
export function ScreenshotSelectionApp() {
  if (mode === 'window') {
    return <WindowSelectionOverlay />
  }
  return <AreaSelectionOverlay />
}
