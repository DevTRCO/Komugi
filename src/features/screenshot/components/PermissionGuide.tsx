import { useEffect, useState } from 'react'
import { commands } from '@/lib/tauri-bindings'
import { Shield, ShieldCheck, ExternalLink } from 'lucide-react'
import { logger } from '@/lib/logger'

interface PermissionStatus {
  screenRecording: boolean
  accessibility: boolean
}

/**
 * Non-intrusive inline guide that shows permission status.
 * Polls every 2 seconds and auto-hides when both permissions are granted.
 */
export function PermissionGuide() {
  const [status, setStatus] = useState<PermissionStatus | null>(null)

  useEffect(() => {
    let active = true

    const check = async () => {
      if (!active) return
      try {
        const screenRecording = await commands.checkScreenRecordingPermission()
        if (!active) return
        const accessibility = await commands.checkAccessibilityPermission()
        if (!active) return
        setStatus({ screenRecording, accessibility })
      } catch (e) {
        logger.warn('Permission check failed', { error: e })
      }
    }

    check()
    const interval = setInterval(check, 2000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // Don't render while loading or when all permissions granted
  if (!status) return null
  if (status.screenRecording && status.accessibility) return null

  const handleOpenScreenRecording = async () => {
    await commands.openScreenRecordingSettings()
  }

  const handleOpenAccessibility = async () => {
    await commands.openAccessibilitySettings()
  }

  return (
    <div className="mx-auto mt-4 max-w-sm rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Shield size={16} />
        Permissions needed
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Komugi needs these permissions for screenshots and global shortcuts.
      </p>

      <div className="space-y-2">
        <PermissionRow
          label="Screen Recording"
          granted={status.screenRecording}
          onOpen={handleOpenScreenRecording}
        />
        <PermissionRow
          label="Accessibility"
          granted={status.accessibility}
          onOpen={handleOpenAccessibility}
        />
      </div>
    </div>
  )
}

function PermissionRow({
  label,
  granted,
  onOpen,
}: {
  label: string
  granted: boolean
  onOpen: () => void
}) {
  if (granted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="text-green-500" />
        <span>{label}</span>
        <span className="ml-auto text-green-500">Granted</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Shield size={14} className="text-amber-500" />
      <span className="text-foreground">{label}</span>
      <button
        onClick={onOpen}
        className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-muted"
      >
        Open Settings
        <ExternalLink size={10} />
      </button>
    </div>
  )
}
