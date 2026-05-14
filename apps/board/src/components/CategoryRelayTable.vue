<script setup lang="ts">
import { computed, provide, watchEffect } from 'vue'
import TableHeader from './CategoryTableHeader.vue'
import CategoryRelayTableRow from './CategoryRelayTableRow.vue'

import { useRelayTeams } from '@/composables/useRelayTeams'
import { AthleteStatus } from '@/types/category'
import { useScrollColumnItem } from '@/composables/scrollColumn/useScrollColumn'
import { useSettingStore } from '@/stores/settings'

import type { Category } from '@/types/category'
import type { Competition } from '@/types/competition'
import { isTableActiveKey } from '@/types/providers'

const props = defineProps<{
  competition: Competition
  category: Category
}>()

const settingsStore = useSettingStore()

const { scrollItemRef, stickyRef, contentRef, isActive } = useScrollColumnItem(
  props.category.name
)

const fetchEnabled = computed(() => isActive.value || settingsStore.areSettingsDisplayed)
const { relayTeams, teamCounts, status, legCount } = useRelayTeams({
  competition: props.competition,
  category: props.category,
  fetchEnabled,
})

const pinnedTeams = computed(() =>
  relayTeams.value
    .filter(t => t.status === AthleteStatus.Ok)
    .slice(0, settingsStore.pinnedCount)
)
const pinnedIds = computed(() => new Set(pinnedTeams.value.map(t => t.id)))
const restTeams = computed(() => relayTeams.value.filter(t => !pinnedIds.value.has(t.id)))

provide(isTableActiveKey, isActive)

watchEffect(() => {
  settingsStore.updateCategoryCount(props.category.name, teamCounts.value.full)
})
</script>

<template>
  <div ref="scrollItemRef">
    <div class="sticky top-0" ref="stickyRef">
      <TableHeader
        class="p-3"
        :category="props.category"
        :athletes-count="teamCounts"
      />
      <div
        v-if="pinnedTeams.length && restTeams.length"
        class="w-full text-table-large font-bold bg-white border-b-2 border-gray-600 border-dashed"
      >
        <CategoryRelayTableRow
          v-for="(item, index) in pinnedTeams"
          :key="item.id"
          :is-even="index % 2 === 0"
          :data="item"
          :leg-count="legCount"
          :show-emojis="settingsStore.showEmojis"
          :timezone="props.competition.timezone"
        />
      </div>
    </div>
    <div ref="contentRef">
      <div
        v-if="status === 'success'"
        class="w-full text-table-large font-bold bg-white"
      >
        <CategoryRelayTableRow
          v-for="(item, index) in (restTeams.length ? restTeams : pinnedTeams)"
          :key="item.id"
          :is-even="index % 2 === 0"
          :data="item"
          :leg-count="legCount"
          :show-emojis="settingsStore.showEmojis"
          :timezone="props.competition.timezone"
        />
      </div>
    </div>
    <div
      v-if="status !== 'success'"
      class="bg-gray-300 h-100 grid gap-4 place-content-center place-items-center"
    >
      <span class="relative flex h-3 w-3">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
      </span>
      <span class="text-2xl font-bold animate-pulse">Loading data</span>
    </div>
  </div>
</template>
