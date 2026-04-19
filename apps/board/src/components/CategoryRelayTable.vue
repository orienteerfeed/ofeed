<script setup lang="ts">
import { provide } from 'vue'
import TableHeader from './CategoryTableHeader.vue'
import CategoryRelayTableRow from './CategoryRelayTableRow.vue'

import { useRelayTeams } from '@/composables/useRelayTeams'
import { useScrollColumnItem } from '@/composables/scrollColumn/useScrollColumn'

import type { Category } from '@/types/category'
import type { Competition } from '@/types/competition'
import { isTableActiveKey } from '@/types/providers'

const props = defineProps<{
  competition: Competition
  category: Category
}>()

const { scrollItemRef, stickyRef, contentRef, isActive } = useScrollColumnItem(
  props.category.name
)

const { relayTeams, teamCounts, status, legCount } = useRelayTeams({
  competition: props.competition,
  category: props.category,
  fetchEnabled: isActive,
})

provide(isTableActiveKey, isActive)
</script>

<template>
  <div ref="scrollItemRef">
    <div class="sticky top-0" ref="stickyRef">
      <TableHeader
        class="p-3"
        :category="props.category"
        :athletes-count="teamCounts"
      />
    </div>
    <div ref="contentRef">
      <div class="w-full text-table-large font-bold bg-white">
        <CategoryRelayTableRow
          v-for="(item, index) in relayTeams"
          :key="item.id"
          :is-even="index % 2 === 0"
          :data="item"
          :leg-count="legCount"
        ></CategoryRelayTableRow>
      </div>
    </div>
    <div v-if="!(status === 'success')" class="bg-gray-300 h-100">
      <span>Loading data</span>
    </div>
  </div>
</template>
