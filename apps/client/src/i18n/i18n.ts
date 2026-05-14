import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';

// If you want strong typing for t(), import your JSON once to infer types:
import enCommon from './locales/en/common.json';
import enTranslation from './locales/en/translation.json';

// App config (if you have one)
import { config } from '@/config';

// ---- i18next typing (optional but recommended) -----------------------------
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    // Mirror your namespaces here for typed t('key')
    resources: {
      common: typeof enCommon;
      translation: typeof enTranslation;
    };
  }
}

// Derives ".orienteerfeed.com" from any subdomain; empty on localhost
function sharedDomain(): string {
  const parts = window.location.hostname.split('.')
  return parts.length > 1 ? '.' + parts.slice(-2).join('.') : ''
}

function writeSharedCookie(lng: string) {
  const domain = sharedDomain()
  const domainPart = domain ? `; domain=${domain}` : ''
  document.cookie = `i18nextLng=${lng}; path=/${domainPart}; max-age=${60 * 60 * 24 * 365}; SameSite=lax`
}

// ---- i18n init -------------------------------------------------------------
i18n
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      (lng: string, ns: string) =>
        // Vite will code-split each JSON namespace per language
        import(`./locales/${lng}/${ns}.json`)
    )
  )
  .use(initReactI18next)
  .init({
    fallbackLng: {
      'en-US': ['en'],
      'cs-CZ': ['cs'],
      'de-DE': ['de'],
      'sv-SE': ['sv'],
      default: ['cs'],
    },
    supportedLngs: ['en', 'cs', 'es', 'de', 'sv'],
    ns: ['translation', 'common'],
    defaultNS: 'translation',
    debug: !!config?.I18N_LOGGING,

    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },

    interpolation: { escapeValue: false },
    // Optional: load language-only (e.g., 'en' from 'en-US')
    // load: 'languageOnly',
  });

// Write shared subdomain cookie whenever language is resolved or changed,
// so board.orienteerfeed.com can read it on load.
i18n.on('languageChanged', writeSharedCookie);

export default i18n;
