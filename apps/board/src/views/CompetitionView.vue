<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import DataProvider from '@/components/DataProvider.vue'
import CompetitionTable from '@/components/CompetitionTable.vue'
import CompetitionSettings from '@/components/CompetitionSettings.vue'

import { useSettingStore } from '@/stores/settings'
import { useWinnerCommentator } from '@/composables/useWinnerCommentator'
import type { DataProviders } from '@/composables/providers/useDataProvider'

const route = useRoute()
const competitionId = computed(() => String(route.params.competitionId ?? '1'))
const dataProvider = computed(
  () => (route.params.providerId as DataProviders | undefined) ?? 'ofeed'
)

const settingsStore = useSettingStore()
const { t } = useI18n()
// Only the OFeed provider publishes leader changes.
const announcing = computed(
  () => dataProvider.value === 'ofeed' && settingsStore.announceWinners
)
useWinnerCommentator(competitionId, announcing)

// Browsers block sound until the page has been interacted with.
const soundUnlocked = ref(navigator.userActivation?.hasBeenActive ?? true)
const unlock = () => (soundUnlocked.value = true)
onMounted(() => {
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
})
</script>

<template>
  <div class="w-screen h-screen overflow-hidden flex flex-col">
    <DataProvider :provider="dataProvider">
      <CompetitionTable :competition-id="competitionId" />
    </DataProvider>
    <CompetitionSettings
      v-if="settingsStore.areSettingsDisplayed"
      class="fixed inset-y-24 right-0 z-3"
    />
    <button
      v-if="announcing && !soundUnlocked"
      class="fixed bottom-4 right-4 z-4 rounded bg-highlight px-4 py-2 text-white shadow-lg"
      @click="unlock"
    >
      {{ t('settings.commentator.enableSound') }}
    </button>
  </div>
</template>
