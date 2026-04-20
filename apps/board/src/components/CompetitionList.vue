<script setup lang="ts">
import CompetitionSublist from './CompetitionSublist.vue'
import { useCompetitions } from '@/composables/useCompetitions'

const { competitions, competitionsByPeriod } = useCompetitions()
</script>

<template>
  <div v-if="competitions" class="my-4">
    <section data-testId="competitions-today">
      <CompetitionSublist :competitions="competitionsByPeriod.today">
        LIVE today
      </CompetitionSublist>
    </section>

    <section class="my-4" data-testId="competitions-future">
      <CompetitionSublist
        :competitions="competitionsByPeriod.future"
        :is-paginated="true"
        :show-date="true"
      >
        Upcoming
      </CompetitionSublist>
    </section>

    <section data-testId="competitions-past">
      <CompetitionSublist
        :competitions="competitionsByPeriod.past"
        :is-paginated="true"
        :show-date="true"
      >
        Past
      </CompetitionSublist>
    </section>
  </div>
  <div v-else>Loading events</div>
</template>
