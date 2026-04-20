<script setup lang="ts">
import { provide } from 'vue'

import { useLiveResultat } from '@/composables/providers/useLiveResultat'
import { useOfeed } from '@/composables/providers/useOfeed'
import { useMockData } from '@/composables/providers/useMockData'

import type { DataProviders } from '@/composables/providers/useDataProvider'
import { useDataProviderKey, type DataProviderSet } from '@/types/providers'

const props = defineProps<{
  provider: DataProviders
}>()

const providerList: Record<DataProviders, DataProviderSet> = {
  liveResultat: useLiveResultat,
  ofeed: useOfeed,
  test: useMockData,
}
const useProvider = providerList[props.provider]

provide(useDataProviderKey, useProvider)
</script>

<template>
  <slot></slot>
</template>
