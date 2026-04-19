<script setup lang="ts">
import { computed } from 'vue'
import { differenceInSeconds } from 'date-fns'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import CategoryRelayTableRowTeam from './CategoryRelayTableRowTeam.vue'
import CategoryRelayTableRowAthlete from './CategoryRelayTableRowAthlete.vue'
import type { RelayTeamWithStats } from '@/types/category'

const props = defineProps<{
  data: RelayTeamWithStats
  isEven: boolean
  legCount: number
}>()
const { now5s } = useTimeHelpers()
const rows = computed(() => props.legCount + 1)

const RECENCY_TIME_SECONDS = 5 * 60
const isRecent = computed(() => {
  if (!props.data.updatedAt) return false
  const secondsFromUpdate = differenceInSeconds(
    now5s.value,
    props.data.updatedAt
  )
  return secondsFromUpdate < RECENCY_TIME_SECONDS
})

const bgColor = computed(() =>
  isRecent.value ? 'bg-highlight' : props.isEven ? 'bg-even' : 'bg-white'
)
const textColor = computed(() => (isRecent.value ? 'text-white' : 'text-black'))

const additionalLegSpaces = computed(() => {
  const legCount = props.legCount - props.data.athletes.length
  return legCount > 0 ? legCount : 0
})
</script>

<template>
  <div
    :class="[`grid-rows-${rows}`, bgColor, textColor]"
    class="grid rounded-lg"
  >
    <CategoryRelayTableRowTeam
      class="table-row-grid text-table-large"
      :data="props.data"
    />
    <CategoryRelayTableRowAthlete
      class="table-row-grid text-table-small"
      v-for="athlete in data.athletes"
      :key="athlete.id"
      :data="athlete"
    ></CategoryRelayTableRowAthlete>
    <template v-for="n in additionalLegSpaces" :key="data.id + '-' + n">
      <div class="table-row-grid text-table-small grid gap-2 px-3 py-1.5">
        <span></span>
        <span>.</span>
      </div>
    </template>
  </div>
</template>

<style>
.table-row-grid {
  grid-template-columns: 5rem 1fr 12rem 10rem;
}
</style>
