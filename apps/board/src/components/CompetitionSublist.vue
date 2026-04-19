<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useTimeHelpers } from '@/composables/useTimeHelpers'
import { useDataProvider } from '@/composables/providers/useDataProvider'
import type { CompetitionList } from '@/types/competition'

const props = defineProps<{
  competitions: CompetitionList
  isPaginated?: boolean
  showDate?: boolean
}>()

const { dateTimeFormatter } = useTimeHelpers()

const pagination = ref(5)
const paginate = (full: boolean) => {
  if (full) pagination.value = props.competitions.length
  else pagination.value += 5
}

const competitionsPaginated = computed(() =>
  props.isPaginated
    ? props.competitions.slice(0, pagination.value)
    : props.competitions
)

const dataProvider = useDataProvider()
const providerId = computed(() => dataProvider.key ?? 'test')
</script>

<template>
  <h3 class="text-xl font-bold text-header"><slot></slot></h3>
  <ul>
    <li
      v-for="competition in competitionsPaginated"
      :key="competition.id"
      class="py-1"
    >
      <RouterLink
        data-testId="competition-link"
        class="text-lg hover:font-bold hover:underline-dashed"
        :to="{
          name: 'event',
          params: { competitionId: competition.id, providerId },
        }"
      >
        <span v-if="showDate"
          >({{ dateTimeFormatter.format(competition.date) }})
        </span>
        {{ competition.name }}
      </RouterLink>
    </li>
  </ul>
  <div
    v-if="isPaginated"
    v-show="competitionsPaginated.length !== competitions.length"
  >
    <button
      class="text-male font-bold p-1 m-2 rounded outline outline-2 outline-male hover:font-bold hover:bg-slate-300"
      @click="() => paginate(false)"
    >
      Show more
    </button>
    <button
      class="text-male font-bold p-1 m-2 rounded outline outline-2 outline-male hover:font-bold hover:bg-slate-300"
      @click="() => paginate(true)"
    >
      Show full
    </button>
  </div>
</template>
