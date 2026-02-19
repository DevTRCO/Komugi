import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { ScreenshotZoomViewer } from '@/features/screenshot/components/ScreenshotZoomViewer'

interface RightSideBarProps {
  children?: React.ReactNode
  className?: string
}

export function RightSideBar({ children, className }: RightSideBarProps) {
  const zoomedSource = useUIStore(state => state.zoomedScreenshotSource)

  const handleCloseZoom = () => {
    useUIStore.getState().closeScreenshotZoom()
  }

  return (
    <div
      className={cn('flex h-full flex-col border-l bg-background', className)}
    >
      {zoomedSource ? (
        <ScreenshotZoomViewer onClose={handleCloseZoom} />
      ) : (
        children
      )}
    </div>
  )
}
