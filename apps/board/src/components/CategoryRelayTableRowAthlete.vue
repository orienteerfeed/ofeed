<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { differenceInSeconds } from 'date-fns'

import SlotVirtualizer from './SlotVirtualizer.vue'
import { formatStatus } from '@/utils/localize'
import { formatTimeOrienteering } from '@/utils/dateTime'
import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { AthleteStatus, isResultItemPre } from '@/types/category'
import type { RelayAthleteWithStats } from '@/types/category'
import { isTableActiveKey } from '@/types/providers'

const props = defineProps<{ data: RelayAthleteWithStats }>()
const isActive = inject(isTableActiveKey, ref(false))
const { now, timeFormatter } = useTimeHelpers()

const timeFormatted = computed(() =>
  props.data.legResult.status === AthleteStatus.Ok
    ? formatTimeOrienteering(props.data.legResult.timeSeconds)
    : ''
)
const lossFormatted = computed(() =>
  props.data.totalResult.status === AthleteStatus.Ok
    ? `+ ${formatTimeOrienteering(props.data.totalResult.loss)}`
    : ''
)

const isRunning = computed(() =>
  isResultItemPre(props.data.legResult)
    ? props.data.startTime
      ? props.data.startTime < now.value
      : props.data.status === AthleteStatus.Running
    : false
)
const timeRunning = computed(() => {
  if (!props.data.startTime || !isRunning.value) return ''
  const secondsFromStart = differenceInSeconds(now.value, props.data.startTime)
  return formatTimeOrienteering(secondsFromStart)
})
const timeRunningDisplay = computed(() => timeRunning.value.slice(0, 8))
const timeFormattedDisplay = computed(() => timeFormatted.value.slice(0, 8))
const lossFormattedDisplay = computed(() => lossFormatted.value.slice(0, 10))

const isNotStarted = computed(
  () => props.data.status === AthleteStatus.NotStarted
)
const startTimeFormatted = computed(() => {
  if (!props.data.startTime || !isNotStarted.value) return ''
  return timeFormatter.format(props.data.startTime)
})
</script>

<template>
  <div class="grid gap-2 px-3 py-1.5">
    <span></span>
    <span>{{ data.surname }} {{ data.firstName }}</span>
    <SlotVirtualizer :is-visible="isActive">
      <template #default>
        <span
          class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
          v-if="data.legResult.status === AthleteStatus.Ok"
          >{{ timeFormattedDisplay }} [{{ data.legResult.rank }}.]</span
        >
        <span
          v-else-if="isRunning"
          class="block min-w-0 overflow-hidden whitespace-nowrap text-right text-xl leading-none tabular-nums"
          >[{{ timeRunningDisplay }}]</span
        >
        <span
          class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
          v-else-if="isNotStarted"
          >{{
          startTimeFormatted
        }}</span>
        <span class="text-right" v-else>{{ formatStatus(data.status) }}</span>
      </template>
    </SlotVirtualizer>
    <span
      class="block min-w-0 overflow-hidden whitespace-nowrap text-right tabular-nums"
      >{{ lossFormattedDisplay }}</span
    >
  </div>
</template>
