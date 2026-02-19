import { useRef, useState } from 'react'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_STEP = 0.15

interface ZoomPanState {
  scale: number
  translateX: number
  translateY: number
}

const INITIAL_STATE: ZoomPanState = { scale: 1, translateX: 0, translateY: 0 }

export function useZoomPan() {
  const [state, setState] = useState<ZoomPanState>(INITIAL_STATE)

  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // React Compiler handles memoization — no manual useCallback needed
  const reset = () => {
    setState(INITIAL_STATE)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setState(prev => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, prev.scale + delta)
      )
      return { ...prev, scale: newScale }
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }

    setState(prev => ({
      ...prev,
      translateX: prev.translateX + dx,
      translateY: prev.translateY + dy,
    }))
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  return {
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    reset,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
    },
  }
}
