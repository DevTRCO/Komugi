import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { LearningProfileEntry } from '@/lib/tauri-bindings'

interface LearningProfileListProps {
  readonly entries: readonly LearningProfileEntry[]
  readonly onDelete: (sessionId: string) => void
  readonly onClearAll: () => void
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return isoDate.slice(0, 10)
  }
}

export function LearningProfileList({
  entries,
  onDelete,
  onClearAll,
}: LearningProfileListProps) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('preferences.general.learningMemory.empty')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('preferences.general.learningMemory.entryCount', {
          count: entries.length,
        })}
      </p>

      <div className="max-h-[200px] space-y-2 overflow-y-auto">
        {entries
          .slice()
          .reverse()
          .map(entry => (
            <div
              key={entry.session_id}
              className="flex items-start gap-2 rounded-md border p-2"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.date)}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {entry.difficulty}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm">{entry.summary}</p>
                {entry.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.topics.map(topic => (
                      <Badge
                        key={topic}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onDelete(entry.session_id)}
                aria-label={t('preferences.general.learningMemory.deleteEntry')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            {t('preferences.general.learningMemory.clearAll')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('preferences.general.learningMemory.clearConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('preferences.general.learningMemory.clearConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('update.later')}</AlertDialogCancel>
            <AlertDialogAction onClick={onClearAll}>
              {t('preferences.general.learningMemory.clearAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
