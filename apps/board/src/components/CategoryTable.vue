<script setup lang="ts">
import { computed } from 'vue'

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

import type { Category } from '@/types/category'
import type { Competition } from '@/types/competition'

const props = defineProps<{
  competition: Competition
  category: Category
}>()

const settingsStore = useSettingStore()
const { scrollItemRef, stickyRef, contentRef, isActive } = useScrollColumnItem(
  props.category.name
)

const { status, athletes, areAvailable, courseInfo } = useAthletes({
  competition: props.competition,
  category: props.category,
  fetchEnabled: isActive,
})

const effectiveCategory = computed(() => ({
  ...props.category,
  length: props.category.length ?? courseInfo.value?.length,
  climb: props.category.climb ?? courseInfo.value?.climb,
  controls: props.category.controls ?? courseInfo.value?.controls,
}))

const athletesCount = computed(() => {
  return {
    finished: athletes.value.finished.length,
    unfinished: athletes.value.unfinished.length,
    full: athletes.value.finished.length + athletes.value.unfinished.length,
  }
})
const finishedAthletes = useFinishedAthletes(athletes)
const unfinishedAthletes = useUnfinishedAthletes(athletes)
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
        v-if="status === 'success' && areAvailable"
        class="w-full text-3xl font-bold bg-white"
      >
        <TableFinishedRow
          v-if="finishedAthletes.firstRow"
          :data="finishedAthletes.firstRow"
          :is-even="false"
          :is-compact="settingsStore.compactMode"
          :show-emojis="settingsStore.showEmojis"
          class="border-b-2 border-gray-600 border-dashed"
        >
        </TableFinishedRow>
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
          :key="row.rank"
          :is-even="index % 2 === 0"
          :is-compact="settingsStore.compactMode"
          :show-emojis="settingsStore.showEmojis"
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
