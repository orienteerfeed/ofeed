<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n/i18n'
import type { Locale } from '@/i18n/i18n'

const { locale } = useI18n()

const LANGUAGES: { key: Locale; country: string; label: string; nativeName: string }[] = [
  { key: 'cs', country: 'cz', label: 'Czech',   nativeName: 'Čeština' },
  { key: 'en', country: 'gb', label: 'English',  nativeName: 'English' },
  { key: 'de', country: 'de', label: 'German',   nativeName: 'Deutsch' },
  { key: 'es', country: 'es', label: 'Spanish',  nativeName: 'Español' },
  { key: 'sv', country: 'se', label: 'Swedish',  nativeName: 'Svenska' },
]

const open = ref(false)

function select(key: Locale) {
  setLocale(key)
  open.value = false
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 px-2 py-1.5 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors w-full"
      @click.stop="open = !open"
    >
      <span class="i-mdi-translate w-4 h-4 shrink-0 text-gray-500" />
      <span class="flex-1 text-left">
        {{ LANGUAGES.find(l => l.key === locale)?.label }}
        <span class="text-gray-400 ml-1 text-xs">{{ LANGUAGES.find(l => l.key === locale)?.nativeName }}</span>
      </span>
      <span
        class="i-mdi-chevron-down w-4 h-4 shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <div
      v-if="open"
      class="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
    >
      <button
        v-for="lang in LANGUAGES"
        :key="lang.key"
        type="button"
        class="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
        :class="locale === lang.key ? 'bg-gray-50' : ''"
        @click.stop="select(lang.key)"
      >
        <span :class="`fi fi-${lang.country} fis`" class="shrink-0 rounded-sm w-5 h-5 object-cover" style="font-size: 1.25rem" />
        <span class="flex flex-col flex-1 min-w-0 text-left">
          <span class="font-medium text-gray-900" :class="{ 'text-blue-600': locale === lang.key }">{{ lang.label }}</span>
          <span class="text-xs text-gray-400">{{ lang.nativeName }}</span>
        </span>
        <span v-if="locale === lang.key" class="i-mdi-check w-4 h-4 text-blue-500 shrink-0" />
      </button>
    </div>
  </div>

  <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />
</template>
