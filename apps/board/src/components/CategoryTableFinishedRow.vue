<script setup lang="ts">
import { computed } from 'vue'
import { differenceInSeconds } from 'date-fns'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { formatStatus } from '@/utils/localize'
import { rowGridColumns } from '@/utils/tableLayout'
import { AthleteStatus } from '@/types/category'
import type { AthleteWithStats } from '@/types/category'

const props = withDefaults(
  defineProps<{
    data: AthleteWithStats
    isEven: boolean
    isCompact?: boolean
    showClub?: boolean
    showRegistration?: boolean
    showEmojis?: boolean
    awardedPlaces?: number
  }>(),
  {
    isCompact: false,
    showClub: false,
    showRegistration: false,
    showEmojis: true,
    awardedPlaces: 3,
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
const isClubShown = computed(() => !props.isCompact || props.showClub)
const gridStyle = computed(() => ({
  gridTemplateColumns: rowGridColumns({
    compact: props.isCompact,
    club: isClubShown.value,
    registration: props.showRegistration,
  }),
}))
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
  [AthleteStatus.DidNotStart]: '🚷',
  [AthleteStatus.NotStarted]: '🚪',
}

const medalEmojis: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
// Without emojis: gold / silver / bronze badge, lighter for further awarded places.
const medalBadges: Record<number, string> = { 1: 'bg-amber-300', 2: 'bg-gray-300', 3: 'bg-amber-600' }
const medalBadge = (rank: number | undefined) =>
  `rounded text-black ${medalBadges[rank ?? 0] ?? 'bg-amber-100'}`
const isAwarded = computed(
  () => props.data.rank !== undefined && props.data.rank <= props.awardedPlaces
)
const medal = computed(() =>
  props.showEmojis && isAwarded.value ? medalEmojis[props.data.rank!] : undefined
)
</script>

<template>
  <div
    :class="[bgColor, textColor]"
    :style="gridStyle"
    class="grid gap-2 px-3 py-1.5 rounded-lg"
  >
    <span v-if="data.status === AthleteStatus.Ok">
      <template v-if="medal">{{ medal }}</template>
      <span
        v-else-if="data.rank !== undefined"
        class="tabular-nums"
        :class="isAwarded && medalBadge(data.rank)"
        :data-awarded="isAwarded || undefined"
        >{{ data.rank }}.</span
      >
      <!-- Unordered result list: just mark a clean finish. -->
      <template v-else>✅</template>
    </span>
    <span v-else-if="data.status === AthleteStatus.NotCompeting">MS</span>
    <span v-else-if="showEmojis && emojisMapping[data.status]">{{
      emojisMapping[data.status]
    }}</span>
    <span v-else></span>
    <span class="text-ellipsis overflow-hidden whitespace-nowrap"
      >{{ data.surname }} {{ data.firstName }}</span
    >
    <span v-if="showRegistration" class="whitespace-nowrap">{{ data.registration }}</span>
    <span v-if="!isCompact">{{ data.card }}</span>
    <span v-if="isClubShown" class="text-ellipsis overflow-hidden whitespace-nowrap">{{
      data.club
    }}</span>
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
