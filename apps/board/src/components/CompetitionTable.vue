<script setup lang="ts">
import { computed, watchEffect, toRefs, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'

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
const { t } = useI18n()
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
      .map((displayCategory) => {
        const category = categoriesHashByName.value[displayCategory.name]
        if (!category) return null
        const override = displayCategory.colorOverride ?? undefined
        return override ? { ...category, colorOverride: override } : category
      })
      .filter((category): category is NonNullable<typeof category> => Boolean(category))
  )
)

const availableCategories = computed(() =>
  Object.keys(categoriesHashByName.value)
)
watchEffect(() =>
  settingStore.setAvailableCategories(availableCategories.value)
)

watchEffect(() => {
  if (!competition.value) return
  for (const category of competition.value.categories) {
    const count = competition.value.isRelay
      ? category.teamsCount
      : category.competitorsCount
    if (count !== undefined) {
      settingStore.updateCategoryCount(category.name, count)
    }
  }
})

const isEmpty = computed(
  () => status.value === 'success' && competition.value && availableCategories.value.length === 0
)
</script>

<template>
  <CompetitionHeader v-if="competition" :competition="competition" />
  <div class="font-mrb grow flex overflow-hidden pt-3">
    <template v-if="status === 'success' && competition && !isEmpty">
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
    <div v-else-if="isEmpty" class="flex items-start w-full px-4 pt-4">
      <div class="flex gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-amber-800 w-full">
        <span class="i-mdi-alert-outline mt-0.5 shrink-0 text-amber-500 w-5 h-5" />
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold text-sm">{{ t('noData.title') }}</span>
          <span class="text-sm opacity-80">{{ t('noData.description') }}</span>
        </div>
      </div>
    </div>
    <div v-else-if="status === 'pending'" class="px-4 pt-4 text-sm text-gray-500">
      {{ t('loading') }}
    </div>
    <div v-else class="px-4 pt-4 text-sm text-red-500">
      {{ t('error') }}
    </div>
  </div>
</template>
