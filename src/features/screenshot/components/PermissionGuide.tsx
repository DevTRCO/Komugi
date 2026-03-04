import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { relaunch } from '@tauri-apps/plugin-process'
import { commands } from '@/lib/tauri-bindings'
import { Shield, ShieldCheck, ExternalLink, RotateCcw } from 'lucide-react'
import { logger } from '@/lib/logger'

interface PermissionStatus {
  screenRecording: boolean
  accessibility: boolean
}

/**
 * Non-intrusive inline guide that shows permission status.
 * Polls every 2 seconds and auto-hides when both permissions are granted.
 * Includes restart hint — macOS requires an app restart after granting
 * screen recording permission for it to take effect.
 */
export function PermissionGuide() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const [showRestartHint, setShowRestartHint] = useState(false)

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
    setShowRestartHint(true)
  }

  const handleOpenAccessibility = async () => {
    await commands.openAccessibilitySettings()
  }

  const handleRestart = async () => {
    await relaunch()
  }

  return (
    <div className="mx-auto mt-4 max-w-sm rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Shield size={16} />
        {t('permissions.title')}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t('permissions.description')}
      </p>

      <div className="space-y-2">
        <PermissionRow
          label={t('permissions.screenRecording')}
          granted={status.screenRecording}
          onOpen={handleOpenScreenRecording}
        />
        <PermissionRow
          label={t('permissions.accessibility')}
          granted={status.accessibility}
          onOpen={handleOpenAccessibility}
        />
      </div>

      {/* Restart hint — macOS requires restart after granting screen recording */}
      {showRestartHint && !status.screenRecording && (
        <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-400">
            {t('permissions.restartHint')}
          </p>
          <button
            onClick={handleRestart}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <RotateCcw size={12} />
            {t('permissions.restart')}
          </button>
        </div>
      )}
    </div>
  )
}

function PermissionRow({
  label,
  granted,
  onOpen,
}: {
  readonly label: string
  readonly granted: boolean
  readonly onOpen: () => void
}) {
  const { t } = useTranslation()

  if (granted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="text-green-500" />
        <span>{label}</span>
        <span className="ml-auto text-green-500">{t('permissions.granted')}</span>
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
        {t('permissions.openSettings')}
        <ExternalLink size={10} />
      </button>
    </div>
  )
}
