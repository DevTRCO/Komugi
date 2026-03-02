import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle, Eye, EyeOff, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { commands } from '@/lib/tauri-bindings'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'

const MIN_KEY_LENGTH = 20
const KEY_PREFIX = 'AIza'

interface ApiKeyStatusProps {
  readonly isLoading: boolean
  readonly hasKey: boolean
}

function ApiKeyStatusIndicator({ isLoading, hasKey }: ApiKeyStatusProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return <span className="text-muted-foreground">...</span>
  }

  if (hasKey) {
    return (
      <>
        <CheckCircle size={16} className="text-green-500" />
        <span className="text-muted-foreground">
          {t('preferences.advanced.apiConfigured')}
        </span>
      </>
    )
  }

  return (
    <>
      <XCircle size={16} className="text-destructive" />
      <span className="text-destructive">
        {t('preferences.advanced.apiNotConfigured')}
      </span>
    </>
  )
}

function useApiKeyStatus() {
  return useQuery({
    queryKey: ['apiKeyConfigured'],
    queryFn: async () => {
      const result = await commands.checkApiKeyConfigured()
      if (result.status === 'ok') return result.data
      throw new Error(result.error)
    },
    staleTime: Infinity,
  })
}

function isValidKeyFormat(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && key.length >= MIN_KEY_LENGTH
}

export function AdvancedPane() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: keychainConfigured, isLoading } = useApiKeyStatus()
  const setApiKeyConfigured = useSettingsStore(
    state => state.setApiKeyConfigured
  )

  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const hasKey = !!keychainConfigured
  const canSave = isValidKeyFormat(keyInput) && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const result = await commands.saveApiKey(keyInput)
    setSaving(false)

    if (result.status === 'ok') {
      toast.success(t('preferences.advanced.apiSaved'))
      setKeyInput('')
      setShowKey(false)
      setApiKeyConfigured(true)
      queryClient.invalidateQueries({ queryKey: ['apiKeyConfigured'] })
      return
    }

    // Distinguish keychain access denied from other errors
    if (result.error.includes('denied')) {
      toast.error(t('preferences.advanced.keychainDenied'))
    } else {
      toast.error(result.error)
    }
  }

  async function handleRemove() {
    const result = await commands.removeApiKey()
    if (result.status === 'ok') {
      toast.success(t('preferences.advanced.apiRemoved'))
      setApiKeyConfigured(false)
      queryClient.invalidateQueries({ queryKey: ['apiKeyConfigured'] })
      return
    }
    toast.error(result.error)
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.advanced.title')}>
        <SettingsField
          label={t('preferences.advanced.apiKey')}
          description={t('preferences.advanced.apiKeyDescription')}
        >
          <div className="flex items-center gap-2 text-sm">
            <ApiKeyStatusIndicator isLoading={isLoading} hasKey={hasKey} />
          </div>

          {/* Key input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={t('preferences.advanced.apiKeyPlaceholder')}
                className="pr-9"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button size="sm" disabled={!canSave} onClick={handleSave}>
              {t('preferences.advanced.apiSave')}
            </Button>
          </div>

          {/* Validation hint */}
          {keyInput.length > 0 && !isValidKeyFormat(keyInput) && (
            <p className="text-xs text-destructive">
              {t('preferences.advanced.apiInvalidFormat')}
            </p>
          )}

          {/* Remove button */}
          {keychainConfigured && (
            <Button variant="outline" size="sm" onClick={handleRemove}>
              {t('preferences.advanced.apiRemove')}
            </Button>
          )}
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
