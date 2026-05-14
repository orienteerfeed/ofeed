import { createI18n } from 'vue-i18n'

import en from './locales/en/common.json'
import cs from './locales/cs/common.json'
import de from './locales/de/common.json'
import es from './locales/es/common.json'
import sv from './locales/sv/common.json'

export const SUPPORTED = ['en', 'cs', 'de', 'es', 'sv'] as const
export type Locale = (typeof SUPPORTED)[number]

const STORAGE_KEY = 'i18nextLng'
const COOKIE_NAME = 'i18nextLng'

// Derives ".orienteerfeed.com" from "board.orienteerfeed.com"; empty on localhost
function sharedDomain(): string {
  const parts = window.location.hostname.split('.')
  return parts.length > 1 ? '.' + parts.slice(-2).join('.') : ''
}

function getCookieLocale(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  const val = match?.[1]
  return val && SUPPORTED.includes(val as Locale) ? (val as Locale) : null
}

function setCookieLocale(lang: Locale) {
  const domain = sharedDomain()
  const domainPart = domain ? `; domain=${domain}` : ''
  document.cookie = `${COOKIE_NAME}=${lang}; path=/${domainPart}; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

function detectLocale(): Locale {
  // Cookie first — shared across subdomains; then localStorage; then browser language
  const cookie = getCookieLocale()
  if (cookie) return cookie
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED.includes(stored as Locale)) return stored as Locale
  const lang = navigator.language.split('-')[0]
  if (SUPPORTED.includes(lang as Locale)) return lang as Locale
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, cs, de, es, sv },
})

export function setLocale(lang: Locale) {
  i18n.global.locale.value = lang
  localStorage.setItem(STORAGE_KEY, lang)
  setCookieLocale(lang)
}

// Live-sync when client changes language in the same-origin tab (dev / same subdomain)
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue && SUPPORTED.includes(e.newValue as Locale)) {
    i18n.global.locale.value = e.newValue as Locale
  }
})
