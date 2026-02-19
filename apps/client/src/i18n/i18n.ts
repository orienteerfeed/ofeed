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

export default i18n;
