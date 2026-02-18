import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle } from 'lucide-react'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'

export function AdvancedPane() {
  const { t } = useTranslation()
  const apiKeyConfigured = !!import.meta.env.VITE_GEMINI_API_KEY

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.advanced.title')}>
        <SettingsField
          label={t('preferences.advanced.apiStatus')}
          description={t('preferences.advanced.apiStatusDescription')}
        >
          <div className="flex items-center gap-2 text-sm">
            {apiKeyConfigured ? (
              <>
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-muted-foreground">
                  {t('preferences.advanced.apiConfigured')}
                </span>
              </>
            ) : (
              <>
                <XCircle size={16} className="text-destructive" />
                <span className="text-destructive">
                  {t('preferences.advanced.apiNotConfigured')}
                </span>
              </>
            )}
          </div>
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
