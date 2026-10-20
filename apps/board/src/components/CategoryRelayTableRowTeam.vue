<script setup lang="ts">
import { computed } from 'vue'
import { formatStatus } from '@/utils/localize'
import { formatTimeOrienteering } from '@/utils/dateTime'
import { AthleteStatus, isResultItemOk } from '@/types/category'
import type { RelayTeamWithStats } from '@/types/category'

const props = withDefaults(
  defineProps<{
    data: RelayTeamWithStats
    showEmojis?: boolean
    awardedPlaces?: number
  }>(),
  { awardedPlaces: 3 }
)

const medalEmojis: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const rank = computed(() => {
  const result = props.data.latestTotalResult
  return isResultItemOk(result) ? result.rank : undefined
})
const isAwarded = computed(
  () => rank.value !== undefined && rank.value <= props.awardedPlaces
)
const medal = computed(() =>
  props.showEmojis && isAwarded.value ? medalEmojis[rank.value!] : undefined
)

const timeFormatted = computed(() =>
  props.data.latestTotalResult.status === AthleteStatus.Ok
    ? formatTimeOrienteering(props.data.latestTotalResult.timeSeconds)
    : ''
)
const timeFormattedDisplay = computed(() => timeFormatted.value.slice(0, 8))
const lossFormatted = computed(() =>
  props.data.latestTotalResult.status === AthleteStatus.Ok
    ? `+ ${formatTimeOrienteering(props.data.latestTotalResult.loss)}`
    : ''
)
const lossFormattedDisplay = computed(() => lossFormatted.value.slice(0, 10))

const removeEmptySpaceFromString = (str: string) => str.replace(/\s/g, '')
const clubNameFormatted = computed(() =>
  removeEmptySpaceFromString(props.data.name)
)
</script>

<template>
  <div class="grid gap-2 px-3 py-1.5">
    <span
      v-if="
        data.status === AthleteStatus.Ok &&
        data.latestTotalResult.status === AthleteStatus.Ok
      "
    >
      <template v-if="medal">{{ medal }}</template>
      <span
        v-else
        class="tabular-nums"
        :class="{ 'rounded bg-amber-300 text-black': isAwarded }"
        >{{ rank }}.</span
      >
    </span>
    <span
      class="tabular-nums"
      v-else-if="data.latestTotalResult.status === AthleteStatus.Ok"
      >[{{ data.latestTotalResult.rank }}.]</span
    >
    <span v-else></span>
    <span>{{ clubNameFormatted }} - {{ data.club }}</span>
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      v-if="data.status === AthleteStatus.Ok"
      >{{ timeFormattedDisplay }}</span
    >
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right text-xl leading-none tabular-nums"
      v-else-if="data.status === AthleteStatus.Running && timeFormatted"
      >[{{ timeFormattedDisplay }}]</span
    >
    <span class="text-right" v-else>{{ formatStatus(data.status) }}</span>
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      >{{ lossFormattedDisplay }}</span
    >
  </div>
</template>
