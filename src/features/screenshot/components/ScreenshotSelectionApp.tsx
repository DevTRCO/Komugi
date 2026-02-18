import { useCallback, useEffect, useRef, useState } from 'react'
import { commands } from '@/lib/tauri-bindings'

interface SelectionRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

/**
 * Fullscreen transparent overlay for area selection.
 * User draws a rectangle by clicking and dragging.
 * On release: coordinates sent to Rust for cropping.
 * On Escape: selection cancelled.
 */
export function ScreenshotSelectionApp() {
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

      // Scale to physical pixels (devicePixelRatio)
      const scale = window.devicePixelRatio
      await commands.completeAreaSelection(
        Math.round(x * scale),
        Math.round(y * scale),
        Math.round(width * scale),
        Math.round(height * scale)
      )
    },
    [handleCancel]
  )

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

  // Calculate rectangle for rendering
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
