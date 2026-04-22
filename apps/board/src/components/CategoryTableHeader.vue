<script setup lang="ts">
import { computed } from 'vue'
import type { Category } from '@/types/category'

const props = defineProps<{
  category: Category
  athletesCount: { finished: number; unfinished: number; full: number }
}>()

const bgColors = {
  M: 'bg-male',
  F: 'bg-female',
  X: 'bg-neutral',
}
const categoryBackground = computed(
  () => bgColors[props.category.gender] || bgColors.X
)

const categoryDescription = computed(() => {
  const parts = []
  if (props.category.length) parts.push(`${props.category.length} m`)
  if (props.category.climb) parts.push(`↑${props.category.climb} m`)
  if (props.category.controls) parts.push(`${props.category.controls} k`)
  return parts.join(' / ')
})
</script>

<template>
  <h2
    :class="categoryBackground"
    class="sticky flex justify-between gap-2.5 top-0 rounded-lg text-white text-4xl font-bold z-2"
  >
    <span>{{ props.category.name }}</span>
    <span v-if="true">{{ categoryDescription }} </span>
    <span
      >{{ props.athletesCount.finished }} / {{ props.athletesCount.full }}</span
    >
  </h2>
</template>
