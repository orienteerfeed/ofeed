<script setup lang="ts">
import { computed, watchEffect, toRefs, defineAsyncComponent } from 'vue'

import CompetitionHeader from '@/components/CompetitionHeader.vue'
import ScrollColumn from '@/components/ScrollColumn.vue'
// import CategoryTable from '@/components/CategoryTable.vue'

import { useCompetition } from '@/composables/useCompetition'
import { useSettingStore } from '@/stores/settings'

const CategorySingleTable = defineAsyncComponent(
  () => import('@/components/CategoryTable.vue')
)
const CategoryRelayTable = defineAsyncComponent(
  () => import('@/components/CategoryRelayTable.vue')
)

const props = defineProps<{
  competitionId: string
}>()
const settingStore = useSettingStore()
const { competitionId } = toRefs(props)
const { competition, status } = useCompetition(competitionId)

const CategoryTable = computed(() =>
  competition.value
    ? competition.value.isRelay
      ? CategoryRelayTable
      : CategorySingleTable
    : null
)

const categoriesHashByName = computed(() => {
  if (!competition.value) return {}
  return competition.value.categories.reduce((hash, category) => {
    hash[category.name] = category
    return hash
  }, {} as Record<string, (typeof competition.value.categories)[number]>)
})

const categoryColumns = computed(() =>
  settingStore.categoriesDisplayByColumn.map((columnCategories) =>
    columnCategories
      .map((category) => categoriesHashByName.value[category.name])
      .filter((category): category is NonNullable<typeof category> => Boolean(category))
  )
)

const availableCategories = computed(() =>
  Object.keys(categoriesHashByName.value)
)
watchEffect(() =>
  settingStore.setAvailableCategories(availableCategories.value)
)
</script>

<template>
  <CompetitionHeader v-if="competition" :competition="competition" />
  <div class="font-mrb grow flex overflow-hidden pt-3">
    <template v-if="status === 'success' && competition">
      <ScrollColumn
        v-for="(columnCategories, index) in categoryColumns"
        :key="'result-col-' + index"
        class="px-1.5"
      >
        <CategoryTable
          v-for="category in columnCategories"
          :key="category.name"
          :competition="competition"
          :category="category"
          class="mb-4"
        />
      </ScrollColumn>
    </template>
    <div v-else-if="status === 'pending'">Loading data</div>
    <div v-else>Error occured while loading data, try again later</div>
  </div>
</template>
