<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

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
// Only the OFeed provider publishes leader changes.
useWinnerCommentator(
  competitionId,
  computed(
    () => dataProvider.value === 'ofeed' && settingsStore.announceWinners
  )
)
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
  </div>
</template>
