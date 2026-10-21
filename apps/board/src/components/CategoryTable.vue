<script setup lang="ts">
import { computed, watchEffect } from 'vue'

import TableHeader from './CategoryTableHeader.vue'
import TableFinishedRow from './CategoryTableFinishedRow.vue'
import TableUnfinishedRow from './CategoryTableUnfinishedRow.vue'

import {
  useAthletes,
  useUnfinishedAthletes,
  useFinishedAthletes,
} from '@/composables/useAthletes'
import { useSettingStore } from '@/stores/settings'
import { useScrollColumnItem } from '@/composables/scrollColumn/useScrollColumn'

import { AthleteStatus, type Category } from '@/types/category'
import type { Competition } from '@/types/competition'

const props = defineProps<{
  competition: Competition
  category: Category
}>()

const settingsStore = useSettingStore()
const { scrollItemRef, stickyRef, contentRef, isActive } = useScrollColumnItem(
  props.category.name
)

const fetchEnabled = computed(() => isActive.value || settingsStore.areSettingsDisplayed)
const { status, athletes, areAvailable, courseInfo } = useAthletes({
  competition: props.competition,
  category: props.category,
  fetchEnabled,
})

const effectiveCategory = computed(() => ({
  ...props.category,
  length: props.category.length ?? courseInfo.value?.length,
  climb: props.category.climb ?? courseInfo.value?.climb,
  controls: props.category.controls ?? courseInfo.value?.controls,
}))

const athletesCount = computed(() => {
  const { finished, unfinished } = athletes.value
  // DNS can no longer change the results, so it counts as done (like in relays).
  const dnsCount = unfinished.filter(
    (a) => a.status === AthleteStatus.DidNotStart
  ).length
  return {
    finished: finished.length + dnsCount,
    unfinished: unfinished.length - dnsCount,
    full: finished.length + unfinished.length,
  }
})
const finishedAthletes = useFinishedAthletes(
  athletes,
  computed(() => settingsStore.pinnedCount),
  computed(() => props.category.resultMode ?? 'Default')
)
const unfinishedAthletes = useUnfinishedAthletes(athletes)

watchEffect(() => {
  settingsStore.updateCategoryCount(props.category.name, athletesCount.value.full)
})
</script>

<template>
  <div ref="scrollItemRef">
    <div class="sticky top-0" ref="stickyRef">
      <TableHeader
        class="p-3"
        :category="effectiveCategory"
        :athletes-count="athletesCount"
      />
      <!-- TODO Add 2rem text class -->
      <div
        v-if="finishedAthletes.pinnedRows.length"
        class="w-full text-3xl font-bold bg-white"
        :class="{ 'border-b-2 border-gray-600 border-dashed': finishedAthletes.restRows.length }"
      >
        <TableFinishedRow
          v-for="(row, index) in finishedAthletes.pinnedRows"
          :key="row.id"
          :data="row"
          :is-even="index % 2 === 0"
          :is-compact="settingsStore.compactMode"
          :show-emojis="settingsStore.showEmojis"
          :awarded-places="category.awardedPlaces"
        />
      </div>
    </div>
    <div ref="contentRef">
      <div
        v-if="status === 'success' && areAvailable"
        class="w-full text-3xl font-bold bg-white"
      >
        <TableFinishedRow
          v-for="(row, index) in finishedAthletes.restRows"
          :data="row"
          :key="row.id"
          :is-even="index % 2 === 0"
          :is-compact="settingsStore.compactMode"
          :show-emojis="settingsStore.showEmojis"
          :awarded-places="category.awardedPlaces"
        >
        </TableFinishedRow>
        <template v-if="settingsStore.showUnfinishedAthletes">
          <TableUnfinishedRow
            v-for="(row, index) in unfinishedAthletes"
            :data="row"
            :key="index"
            :is-even="index % 2 === 0"
            :is-visible="isActive"
            :is-compact="settingsStore.compactMode"
            :show-emojis="settingsStore.showEmojis"
            :timezone="competition.timezone"
          >
          </TableUnfinishedRow>
        </template>
      </div>
    </div>
    <div
      v-if="status !== 'success'"
      class="bg-gray-300 h-100 grid gap-4 place-content-center place-items-center"
    >
      <span class="relative flex h-3 w-3">
        <span
          class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"
        ></span>
        <span
          class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"
        ></span>
      </span>
      <span class="text-2xl font-bold animate-pulse">Loading data</span>
    </div>
  </div>
</template>
