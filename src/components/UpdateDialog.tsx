import { useState } from 'react'
import { relaunch } from '@tauri-apps/plugin-process'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/ui-store'
import { logger } from '@/lib/logger'

type UpdatePhase = 'available' | 'downloading' | 'ready' | 'error'

export function UpdateDialog() {
  const { t } = useTranslation()
  const open = useUIStore(state => state.updateDialogOpen)
  const update = useUIStore(state => state.pendingUpdate)
  const [phase, setPhase] = useState<UpdatePhase>('available')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const handleClose = () => {
    if (phase === 'downloading') return
    useUIStore.getState().setUpdateDialogOpen(false)
    // Reset state for next open
    setPhase('available')
    setProgress(0)
    setErrorMessage('')
  }

  const handleInstall = async () => {
    if (!update) return
    setPhase('downloading')
    setProgress(0)

    try {
      let totalBytes = 0
      let downloadedBytes = 0

      await update.downloadAndInstall(event => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength ?? 0
            logger.info(`Update download started: ${totalBytes} bytes`)
            break
          case 'Progress':
            downloadedBytes += event.data.chunkLength
            if (totalBytes > 0) {
              setProgress(Math.round((downloadedBytes / totalBytes) * 100))
            }
            break
          case 'Finished':
            setProgress(100)
            logger.info('Update download finished')
            break
        }
      })

      setPhase('ready')
    } catch (err) {
      const message = String(err)
      logger.error(`Update installation failed: ${message}`)
      setErrorMessage(message)
      setPhase('error')
    }
  }

  const handleRestart = async () => {
    await relaunch()
  }

  const handleRetry = () => {
    setPhase('available')
    setProgress(0)
    setErrorMessage('')
  }

  if (!update) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={phase !== 'downloading'}
        onPointerDownOutside={e => {
          if (phase === 'downloading') e.preventDefault()
        }}
        onEscapeKeyDown={e => {
          if (phase === 'downloading') e.preventDefault()
        }}
      >
        {phase === 'available' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('update.available')}</DialogTitle>
              <DialogDescription>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-mono">
                  {t('update.versionBadge', {
                    current: update.currentVersion,
                    next: update.version,
                  })}
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('update.later')}
              </Button>
              <Button onClick={handleInstall}>{t('update.installNow')}</Button>
            </DialogFooter>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('update.downloading')}</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-center text-xs">
                {progress}%
              </p>
            </div>
          </>
        )}

        {phase === 'ready' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('update.ready')}</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('update.later')}
              </Button>
              <Button onClick={handleRestart}>{t('update.restartNow')}</Button>
            </DialogFooter>
          </>
        )}

        {phase === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('update.error')}</DialogTitle>
              <DialogDescription className="break-all">
                {errorMessage}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('update.dismiss')}
              </Button>
              <Button onClick={handleRetry}>{t('update.tryAgain')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
