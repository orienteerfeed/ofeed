<script setup lang="ts">
import { computed } from 'vue'
import { differenceInSeconds } from 'date-fns'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { AthleteStatus } from '@/types/category'
import type { AthleteWithStats } from '@/types/category'
import { formatTimeOrienteering } from '@/utils/dateTime'

const props = defineProps<{
  data: AthleteWithStats
  isEven: boolean
  isVisible: boolean
  isCompact: boolean
  showEmojis: boolean
  timezone?: string
}>()

const bgColor = props.isEven ? 'bg-even' : 'bg-white'
const { now, startTimeFormatter } = useTimeHelpers()

const isDNS = computed(() => props.data.status === AthleteStatus.DidNotStart)

const isRunning = computed(() => {
  if (isDNS.value) return false
  return props.data.startTime
    ? props.data.startTime < now.value
    : props.data.status === AthleteStatus.Running
})

const startTimeFormatted = computed(() =>
  startTimeFormatter(props.data.startTime, props.timezone)
)

const timeRunning = computed(() => {
  if (!props.data.startTime || !isRunning.value || !props.isVisible) return ''
  const secondsFromStart = differenceInSeconds(now.value, props.data.startTime)
  return formatTimeOrienteering(secondsFromStart)
})
const timeRunningDisplay = computed(() => timeRunning.value.slice(0, 8))

const gridClass = computed(() =>
  props.isCompact ? 'table-row-grid-compact' : 'table-row-grid'
)
</script>

<template>
  <div
    :class="[bgColor, gridClass]"
    class="grid table-row-grid gap-2 px-3 py-1.5 rounded-lg items-center"
  >
    <span v-if="props.showEmojis && isDNS">🚷</span>
    <span v-else-if="props.showEmojis && isRunning">🏃</span>
    <span v-else-if="props.showEmojis && !isRunning">🛌🏻</span>
    <span v-else></span>
    <span class="text-ellipsis overflow-hidden whitespace-nowrap"
      >{{ data.surname }} {{ data.firstName }}</span
    >
    <span v-if="!isCompact">{{ data.card }}</span>
    <span v-if="!isCompact">{{ data.club }}</span>
    <!-- TODO tabular-nums not nice override, special monospace font? -->
    <span class="text-right" v-if="isDNS">DNS</span>
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right text-xl leading-none tabular-nums"
      v-else-if="isRunning"
      >{{ timeRunningDisplay }}</span
    >
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      v-else
      >{{ startTimeFormatted }}</span
    >
    <span
      v-if="isCompact && !isRunning && data.card"
      class="text-right text-2xl"
      >{{ data.card }}</span
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
