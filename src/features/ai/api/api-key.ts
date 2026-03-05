import { logger } from '@/lib/logger'
import { commands } from '@/lib/tauri-bindings'

export async function loadKeyFromKeychain(): Promise<string | null> {
  const result = await commands.loadApiKey()
  if (result.status === 'ok') return result.data ?? null
  logger.warn('Keychain load failed', { error: result.error })
  return null
}

export async function getApiKey(): Promise<string> {
  const keychainKey = await loadKeyFromKeychain()
  if (keychainKey) return keychainKey

  throw new Error('No API key configured. Add one in Preferences → Advanced.')
}
