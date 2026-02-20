import { useTranslation } from 'react-i18next'
import { locale } from '@tauri-apps/plugin-os'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/hooks/use-theme'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { availableLanguages, languageNames } from '@/i18n'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'
import { CHAT_SKINS } from '@/features/chat/config/skins'
import type { ChatSkinId } from '@/lib/schemas'
import { logger } from '@/lib/logger'

export function AppearancePane() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()
  const chatSkin = useSettingsStore(state => state.chatSkin)
  const setChatSkin = useSettingsStore(state => state.setChatSkin)

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    // Update the theme provider immediately for instant UI feedback
    setTheme(value)

    // Persist the theme preference to disk, preserving other preferences
    if (preferences) {
      savePreferences.mutate({ ...preferences, theme: value })
    }
  }

  const handleLanguageChange = async (value: string) => {
    const language = value === 'system' ? null : value

    try {
      // Change the language immediately for instant UI feedback
      if (language) {
        await i18n.changeLanguage(language)
      } else {
        // System language selected - detect and apply system locale
        const systemLocale = await locale()
        const langCode = systemLocale?.split('-')[0]?.toLowerCase() ?? 'en'
        const targetLang = availableLanguages.includes(langCode)
          ? langCode
          : 'en'
        await i18n.changeLanguage(targetLang)
      }
    } catch (error) {
      logger.error('Failed to change language', { error })
      toast.error(t('toast.error.generic'))
      return
    }

    // Persist the language preference to disk
    if (preferences) {
      savePreferences.mutate({ ...preferences, language })
    }
  }

  // Determine the current language value for the select
  const currentLanguageValue = preferences?.language ?? 'system'

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.appearance.language')}>
        <SettingsField
          label={t('preferences.appearance.language')}
          description={t('preferences.appearance.languageDescription')}
        >
          <Select
            value={currentLanguageValue}
            onValueChange={handleLanguageChange}
            disabled={savePreferences.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                {t('preferences.appearance.language.system')}
              </SelectItem>
              {availableLanguages.map(lang => (
                <SelectItem key={lang} value={lang}>
                  {languageNames[lang] ?? lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.appearance.theme')}>
        <SettingsField
          label={t('preferences.appearance.colorTheme')}
          description={t('preferences.appearance.colorThemeDescription')}
        >
          <Select
            value={theme}
            onValueChange={handleThemeChange}
            disabled={savePreferences.isPending}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('preferences.appearance.selectTheme')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                {t('preferences.appearance.theme.light')}
              </SelectItem>
              <SelectItem value="dark">
                {t('preferences.appearance.theme.dark')}
              </SelectItem>
              <SelectItem value="system">
                {t('preferences.appearance.theme.system')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.appearance.chatSkin')}>
        <SettingsField
          label={t('preferences.appearance.chatSkin')}
          description={t('preferences.appearance.chatSkinDescription')}
        >
          <div className="grid grid-cols-3 gap-3">
            {CHAT_SKINS.map(skin => (
              <SkinCard
                key={skin.id}
                id={skin.id}
                name={t(skin.nameKey)}
                description={t(skin.descriptionKey)}
                preview={skin.preview}
                selected={chatSkin === skin.id}
                onSelect={setChatSkin}
              />
            ))}
          </div>
        </SettingsField>
      </SettingsSection>
    </div>
  )
}

interface SkinCardProps {
  id: ChatSkinId
  name: string
  description: string
  preview: { bg: string; accent: string; text: string }
  selected: boolean
  onSelect: (id: ChatSkinId) => void
}

function SkinCard({
  id,
  name,
  description,
  preview,
  selected,
  onSelect,
}: SkinCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`relative cursor-pointer rounded-lg border p-3 text-start transition-colors ${
        selected
          ? 'border-primary bg-accent'
          : 'border-border hover:border-primary/50'
      }`}
    >
      {selected && (
        <div className="absolute end-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary">
          <Check size={10} className="text-primary-foreground" />
        </div>
      )}
      <div
        className="mb-2 flex h-8 items-center gap-1.5 rounded"
        style={{ backgroundColor: preview.bg }}
      >
        <div
          className="ms-2 h-3 w-3 rounded-full"
          style={{ backgroundColor: preview.accent }}
        />
        <div
          className="h-1.5 w-8 rounded-full"
          style={{ backgroundColor: preview.text, opacity: 0.7 }}
        />
      </div>
      <p className="text-sm font-medium">{name}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  )
}
