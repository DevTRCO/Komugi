import { useTranslation } from 'react-i18next'
import { Bug, GraduationCap, Palette } from 'lucide-react'
import { PRESET_CONFIGS } from '@/features/ai/config/presets'

const ICON_MAP = {
  Bug,
  GraduationCap,
  Palette,
} as const

interface PresetPillsProps {
  readonly onSelect: (apiPrompt: string, displayLabel: string) => void
  readonly disabled: boolean
}

export function PresetPills({ onSelect, disabled }: PresetPillsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PRESET_CONFIGS.map(preset => {
        const Icon = ICON_MAP[preset.icon]
        const label = t(preset.i18nKey)
        return (
          <button
            key={preset.i18nKey}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(preset.userMessage, label)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon size={14} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
