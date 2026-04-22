<template>
  <slot v-if="isVisible"></slot>
  <slot v-else name="placeholder"></slot>
</template>

<script setup lang="ts">
defineProps<{ isVisible: boolean }>()
</script>
