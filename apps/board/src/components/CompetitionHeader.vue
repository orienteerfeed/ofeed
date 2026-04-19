<script setup lang="ts">
import { ref } from 'vue'
import { useTimeHelpers } from '@/composables/useTimeHelpers'

import { useSettingStore } from '@/stores/settings'
import type { Competition } from '@/types/competition'

const props = defineProps<{ competition: Competition }>()
const settingsStore = useSettingStore()
const { nowFormatted } = useTimeHelpers()

const isToolbarDisplayed = ref(false)
</script>

<template>
  <h1
    class="flex justify-between gap-2.5 bg-header font-mrb font-bold text-4xl text-white p-3"
    @mouseenter="isToolbarDisplayed = true"
    @mouseleave="isToolbarDisplayed = false"
  >
    <!-- <span>{{ props.competition.organizer }}</span> -->
    <span class="tabular-nums">{{ nowFormatted }}</span>
    <span>{{ props.competition.name }}</span>
    <span></span>
    <div class="absolute right-3 z-2 bg-header">
      <RouterLink data-testid="home-button" to="/">Home</RouterLink>
      <button
        @click="() => settingsStore.setSettingsDisplayed()"
        class="ml-3 i-mdi-cog"
      ></button>
    </div>
  </h1>
</template>
