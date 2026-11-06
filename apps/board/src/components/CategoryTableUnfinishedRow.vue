<script setup lang="ts">
import { computed } from 'vue'
import { differenceInSeconds } from 'date-fns'
import { useI18n } from 'vue-i18n'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { AthleteStatus } from '@/types/category'
import type { AthleteWithStats } from '@/types/category'
import { formatTimeOrienteering } from '@/utils/dateTime'
import { rowGridColumns } from '@/utils/tableLayout'
import { isNotCompetingFinished } from '@/composables/useAthletes'

const props = defineProps<{
  data: AthleteWithStats
  isEven: boolean
  isVisible: boolean
  isCompact: boolean
  showClub?: boolean
  showRegistration?: boolean
  showEmojis: boolean
  timezone?: string
}>()

const bgColor = props.isEven ? 'bg-even' : 'bg-white'
const { now, startTimeFormatter } = useTimeHelpers()

const isDNS = computed(() => props.data.status === AthleteStatus.DidNotStart)

const isNC = computed(() => isNotCompetingFinished(props.data))
const { t } = useI18n()
// MS/NC label: a unicorn with emojis on, the localized text otherwise.
const ncLabel = computed(() => (props.showEmojis ? '🦄' : t('notCompeting')))
// MS/NC who has not finished yet is in the start list: mark the status after the name.
const isNCPending = computed(
  () => props.data.status === AthleteStatus.NotCompeting && !isNC.value
)

const isRunning = computed(() => {
  if (isDNS.value || isNC.value) return false
  return props.data.startTime
    ? props.data.startTime < now.value
    : props.data.status === AthleteStatus.Running
})

// A finished MS shows the run time instead of the start time.
const startTimeFormatted = computed(() =>
  isNC.value
    ? formatTimeOrienteering(props.data.timeSeconds).slice(0, 8)
    : startTimeFormatter(props.data.startTime, props.timezone)
)

const timeRunning = computed(() => {
  if (!props.data.startTime || !isRunning.value || !props.isVisible) return ''
  const secondsFromStart = differenceInSeconds(now.value, props.data.startTime)
  return formatTimeOrienteering(secondsFromStart)
})
const timeRunningDisplay = computed(() => timeRunning.value.slice(0, 8))

const isClubShown = computed(() => !props.isCompact || props.showClub)
const gridStyle = computed(() => ({
  gridTemplateColumns: rowGridColumns({
    compact: props.isCompact,
    club: isClubShown.value,
    registration: props.showRegistration,
  }),
}))
</script>

<template>
  <div
    :class="bgColor"
    :style="gridStyle"
    class="grid gap-2 px-3 py-1.5 rounded-lg items-center"
  >
    <span v-if="isNC">{{ ncLabel }}</span>
    <span v-else-if="props.showEmojis && isDNS">🚷</span>
    <span v-else-if="props.showEmojis && isRunning">🏃</span>
    <span v-else-if="props.showEmojis && !isRunning">🛌🏻</span>
    <span v-else></span>
    <span class="text-ellipsis overflow-hidden whitespace-nowrap"
      >{{ data.surname }} {{ data.firstName
      }}<template v-if="isNCPending">{{
        ` ${showEmojis ? ncLabel : `(${ncLabel})`}`
      }}</template></span
    >
    <span v-if="showRegistration" class="whitespace-nowrap">{{ data.registration }}</span>
    <span v-if="!isCompact">{{ data.card }}</span>
    <span v-if="isClubShown" class="text-ellipsis overflow-hidden whitespace-nowrap">{{
      data.club
    }}</span>
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
