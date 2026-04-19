<script setup lang="ts">
import { computed } from 'vue'

import DataProvider from '@/components/DataProvider.vue'
import CompetitionList from '@/components/CompetitionList.vue'
import type { DataProviders } from '@/composables/providers/useDataProvider'

type CompetitionProvider = {
  name: string
  value: DataProviders
}

const COMPETITION_PROVIDERS: CompetitionProvider[] = [
  { name: 'LiveResultat events', value: 'liveResultat' },
  { name: 'oFeed events', value: 'ofeed' },
]
const allowedProviders = (import.meta.env.VITE_PROVIDERS?.split(',') ?? [
  'ofeed',
  'liveResultat',
]).filter((provider): provider is DataProviders =>
  ['ofeed', 'liveResultat', 'test'].includes(provider)
)
const competitionsProviders = computed(() =>
  allowedProviders.reduce((acc, p) => {
    const provider = COMPETITION_PROVIDERS.find((cp) => cp.value === p)
    if (provider) acc.push(provider)
    return acc
  }, [] as CompetitionProvider[])
)
</script>

<template>
  <div class="grid home-layout gap-y-10 font-mrb">
    <header class="header text-center mt-10">
      <h1 class="text-4xl font-bold uppercase">OFEED BOARD</h1>
      <p class="text-xl capitalize">Technology Preview</p>
      <p class="mt-6 text-3xl font-semibold">
        Orienteering competitions result board
      </p>
    </header>
    <main
      class="competition-list w-140 justify-self-center lg:justify-self-end lg:pr-4 lg:border-r-3 lg:border-female"
    >
      <template v-for="{ name, value } in competitionsProviders" :key="value">
        <DataProvider :provider="value">
          <CompetitionList>{{ name }}</CompetitionList>
        </DataProvider>
      </template>
    </main>
    <section class="about flex flex-col gap-4 w-140 text-lg lg:pl-8">
      <h2 class="text-2xl font-semibold uppercase text-header">About MRB</h2>
      <p>
        MyResultBoard is competition result presentation system intended for use
        on result screens in the competition centre. MRB is created by
        orienteering athletes for orienteering events but should be modular and
        easily extensible for other time-based sports.
      </p>
      <p>
        This preview currently supports both LiveResultat and oFeed-compatible
        APIs with limited configuration. It is intended for displaying
        orienteering event results on a presentation board.
      </p>
      <p>Upcoming features may include:</p>
      <ul class="list-disc list-inside">
        <li>persistent competition settings (local or online)</li>
        <li>multiple competition data providers</li>
        <li>multiple columns support</li>
        <li>multi screen/device synchronization (settings/takeover mode)</li>
        <li>relay mode</li>
        <li>richer data content options</li>
        <li>and many more</li>
      </ul>
      <p>
        Its recommended to use Chrome as browser. StartTimes and LiveTime
        calculation (if available for competition) might be off out of CET time
        zone (known bug which shall be fixed in future release)
      </p>
    </section>
    <footer class="footer text-center text-xl bg-slate-300 p-10">
      <h2>@MyResultBoard - Contact us</h2>
      <a href="https://github.com/ChcJohnie/myresultboard2"
        ><span class="i-mdi-github">GitHub</span></a
      >
    </footer>
  </div>
</template>

<style scoped>
.header {
  grid-area: header;
}
.competition-list {
  grid-area: main;
}
.about {
  grid-area: about;
}
.footer {
  grid-area: footer;
}

.home-layout {
  grid-template-areas:
    'header'
    'main'
    'about'
    'footer';
}

@media (min-width: 1024px) {
  .home-layout {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'header   header'
      'main     about'
      'footer   footer';
  }
}
</style>
