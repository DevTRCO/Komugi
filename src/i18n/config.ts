import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from '../../locales/ar.json'
import de from '../../locales/de.json'
import en from '../../locales/en.json'
import es from '../../locales/es.json'
import fr from '../../locales/fr.json'
import hi from '../../locales/hi.json'
import ja from '../../locales/ja.json'
import ko from '../../locales/ko.json'
import pt from '../../locales/pt.json'
import zh from '../../locales/zh.json'

const resources = {
  ar: { translation: ar },
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  hi: { translation: hi },
  ja: { translation: ja },
  ko: { translation: ko },
  pt: { translation: pt },
  zh: { translation: zh },
}

// Native display names for the language picker
export const languageNames: Record<string, string> = {
  ar: 'العربية',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  pt: 'Português',
  zh: '中文',
}

// RTL language detection (includes languages not yet in resources for future expansion)
const rtlLanguages = ['ar', 'he', 'fa', 'ur']

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

// Update document direction and lang on language change
i18n.on('languageChanged', lng => {
  const dir = rtlLanguages.includes(lng) ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lng
})

export default i18n

// Export for use in non-React contexts (like menu building)
export { i18n }

// Helper to get available languages
export const availableLanguages = Object.keys(resources)

// Check if a language is RTL
export const isRTL = (lng: string): boolean => rtlLanguages.includes(lng)
