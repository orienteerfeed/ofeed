<script setup lang="ts">
import { computed } from 'vue'
import { differenceInSeconds } from 'date-fns'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { formatStatus } from '@/utils/localize'
import { AthleteStatus } from '@/types/category'
import type { AthleteWithStats } from '@/types/category'

const props = withDefaults(
  defineProps<{
    data: AthleteWithStats
    isEven: boolean
    isCompact?: boolean
    showEmojis?: boolean
  }>(),
  {
    isCompact: false,
    showEmojis: true,
  }
)
const { now } = useTimeHelpers()

const RECENCY_TIME_SECONDS = 5 * 60
const isRecent = computed(() => {
  if (!props.data.updatedAt) return false
  const secondsFromUpdate = differenceInSeconds(now.value, props.data.updatedAt)
  return secondsFromUpdate < RECENCY_TIME_SECONDS
})

const bgColor = computed(() =>
  isRecent.value ? 'bg-highlight' : props.isEven ? 'bg-even' : 'bg-white'
)
const textColor = computed(() => (isRecent.value ? 'text-white' : 'text-black'))
const gridClass = computed(() =>
  props.isCompact ? 'table-row-grid-compact' : 'table-row-grid'
)
const timeDisplay = computed(() => props.data.time?.slice(0, 8) ?? '')
const lossDisplay = computed(() => props.data.loss?.slice(0, 8) ?? '')

const emojisMapping: Record<AthleteStatus, string> = {
  [AthleteStatus.Ok]: '🏁',
  [AthleteStatus.NotCompeting]: '🚫',
  [AthleteStatus.Running]: '🏃',
  [AthleteStatus.DidNotFinish]: '😟',
  [AthleteStatus.Disqualified]: '🏴',
  [AthleteStatus.Mispunch]: '🙈',
  [AthleteStatus.OverMaxTime]: '⏰',
  [AthleteStatus.DidNotStart]: '🥺',
  [AthleteStatus.NotStarted]: '🚪',
}
</script>

<template>
  <div
    :class="[bgColor, textColor, gridClass]"
    class="grid gap-2 px-3 py-1.5 rounded-lg"
  >
    <span v-if="data.status === AthleteStatus.Ok" class="tabular-nums"
      >{{ data.rank }}.</span
    >
    <span v-else-if="data.status === AthleteStatus.NotCompeting">MS</span>
    <span v-else-if="showEmojis && emojisMapping[data.status]">{{
      emojisMapping[data.status]
    }}</span>
    <span v-else></span>
    <span class="text-ellipsis overflow-hidden whitespace-nowrap"
      >{{ data.surname }} {{ data.firstName }}</span
    >
    <span v-if="!isCompact">{{ data.card }}</span>
    <span v-if="!isCompact">{{ data.club }}</span>
    <!-- TODO tabular-nums not nice override, special monospace font? -->
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      v-if="
        data.status === AthleteStatus.Ok ||
        data.status === AthleteStatus.NotCompeting
      "
      >{{ timeDisplay }}</span
    >
    <span class="text-right" v-else>{{ formatStatus(data.status) }}</span>
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      v-if="data.loss"
      >+ {{ lossDisplay }}</span
    >
    <span v-else></span>
  </div>
</template>

<style>
.table-row-grid {
  grid-template-columns: 2em 3fr 1fr 3fr 7em 5em;
}
.table-row-grid-compact {
  grid-template-columns: 2em 1fr max-content 4em;
}
</style>
