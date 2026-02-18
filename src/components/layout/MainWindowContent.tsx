import { cn } from '@/lib/utils'
import { ChatPanel } from '@/features/chat'

interface MainWindowContentProps {
  children?: React.ReactNode
  className?: string
}

export function MainWindowContent({
  children,
  className,
}: MainWindowContentProps) {
  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {children || <ChatPanel />}
    </div>
  )
}
