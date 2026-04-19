<script lang="ts" setup>
import { ref, unref, toRef, watch, computed } from 'vue'
import type { Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'

import { useScrollColumn } from '@/composables/scrollColumn/useScrollColumn'
import { useSettingStore } from '@/stores/settings'
import { useTableSizingStore } from '@/stores/tableSizing'

const settingsStore = useSettingStore()
const tableSizing = useTableSizingStore()
const columnContent = ref<HTMLElement | null>(null)

const {
  columnWrapper,
  columnWrapperRect,
  getNextItemOnPage,
  getNextItemBelowPage,
  checkItemsVisibility,
} = useScrollColumn(toRef(settingsStore, 'scrollType'))

const linesNumber = computed(() => {
  if (!columnWrapperRect.value) return 0
  return Math.floor(columnWrapperRect.value.height / tableSizing.lineHeight)
})
const visiblePageReadInMS = computed(
  () => linesNumber.value * settingsStore.readLineTimeMS || 1000
)

let activeScroll: null | Function = null
let pageScrolls: { [type: string]: ReturnType<typeof useIntervalFn> } = {}
const scrollTypesSetups = {
  page: setupPageScroll,
  row: setupRowScroll,
  continues: setupContinuesScroll,
}
watch(
  () => settingsStore.scrollType,
  (type) => {
    if (activeScroll) {
      activeScroll()
      activeScroll = null
    }
    if (type !== 'none') {
      activeScroll = scrollTypesSetups[type]()
    }
  },
  { immediate: true }
)

function isColumnBottom() {
  if (!columnContent.value) return true
  return isFullyDisplayed(columnContent.value)
}

function isColumnTop() {
  if (!columnContent.value) return true
  return columnWrapperRect.value.top >= 0
}

function scrollColumnToTop() {
  columnWrapper.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function isFullyDisplayed(table: Ref<HTMLElement> | HTMLElement) {
  const tableElement = unref(table)
  const rect = tableElement.getBoundingClientRect()
  const bottomMargin = 16
  const tablePxRemaining = rect.bottom - columnWrapperRect.value.bottom
  return Math.floor(tablePxRemaining) <= bottomMargin
}

function scrollDownBy(
  getNextItem: typeof getNextItemBelowPage | typeof getNextItemOnPage
) {
  const nextItem = getNextItem()
  if (!nextItem) {
    checkItemsVisibility()
    return
  }
  if (nextItem.nextSubItem) {
    const nextItemRect = nextItem.nextSubItem.getBoundingClientRect()
    const stickyHeaderHeight = nextItem.item.stickyRef.value?.offsetHeight || 0
    const scrollY =
      nextItemRect.top - columnWrapperRect.value.top - stickyHeaderHeight
    columnWrapper.value?.scrollBy({ top: scrollY, behavior: 'smooth' })
  } else {
    const rect = nextItem.item.elementRef.value.getBoundingClientRect()
    const scrollY = rect.top - columnWrapperRect.value.top
    columnWrapper.value?.scrollBy({ top: scrollY, behavior: 'smooth' })
  }
}
const scrollDownByPage = () => scrollDownBy(getNextItemBelowPage)
const scrollDownByRow = () => scrollDownBy(getNextItemOnPage)
const scrollDownByType = {
  page: scrollDownByPage,
  row: scrollDownByRow,
}

function scrollBy(
  scrollDownByFn: typeof scrollDownByPage | typeof scrollDownByRow
) {
  if (isColumnTop()) checkItemsVisibility() // BugFix after scrolltop visibility is sometimes off, Improve in useSC?
  if (isColumnBottom()) scrollColumnToTop()
  else scrollDownByFn()
}

function setupPageScrollSkeleton(
  type: 'page' | 'row',
  interval: Parameters<typeof useIntervalFn>[1]
) {
  const pageScrollInterval =
    pageScrolls[type] ??
    useIntervalFn(() => scrollBy(scrollDownByType[type]), interval)
  if (!pageScrolls[type]) pageScrolls[type] = pageScrollInterval
  if (!pageScrollInterval.isActive.value) pageScrollInterval.resume()
  return pageScrollInterval.pause
}

function setupPageScroll() {
  return setupPageScrollSkeleton('page', visiblePageReadInMS)
}

function setupRowScroll() {
  return setupPageScrollSkeleton('row', () => settingsStore.readLineTimeMS)
}

function setupContinuesScroll() {
  const isCancelled = ref(false)
  const cancel = () => (isCancelled.value = true)
  startContinuesScroll(isCancelled)
  return cancel
}

function startContinuesScroll(isCancelled: Ref<boolean>) {
  window.setTimeout(() => {
    if (isCancelled.value) return
    scrollContinuously(isCancelled)
  }, visiblePageReadInMS.value / 2)
}

function scrollContinuously(isCancelled: Ref<boolean>) {
  if (columnWrapper.value === null) return
  if (columnContent.value === null) return
  const wrapperRect = columnWrapper.value.getBoundingClientRect()
  const contentRect = columnContent.value.getBoundingClientRect()
  const scrollLength =
    contentRect.bottom - (wrapperRect.height + wrapperRect.top)
  const scrollDuration =
    Math.floor(scrollLength / tableSizing.lineHeight) *
    settingsStore.readLineTimeMS

  const startPos = wrapperRect.top - contentRect.top
  const diff = scrollLength

  let startTime: number | null = null
  let requestId: number | null

  const loop = function (currentTime: DOMHighResTimeStamp) {
    if (isCancelled.value) {
      if (requestId) window.cancelAnimationFrame(requestId)
      return
    }
    if (!startTime) {
      startTime = currentTime
    }

    // Elapsed time in miliseconds
    const time = currentTime - startTime

    const percent = Math.min(time / scrollDuration, 1)
    columnWrapper.value?.scrollTo(0, startPos + diff * percent)

    if (time < scrollDuration) {
      // Continue moving
      requestId = window.requestAnimationFrame(loop)
    } else if (requestId) {
      window.cancelAnimationFrame(requestId)
      window.setTimeout(() => {
        if (isCancelled.value) return
        scrollColumnToTop()
        startContinuesScroll(isCancelled)
      }, visiblePageReadInMS.value)
    }
  }
  requestId = window.requestAnimationFrame(loop)
}
</script>

<template>
  <div class="flex-1 overflow-y-scroll columnWrapper" ref="columnWrapper">
    <div ref="columnContent"><slot></slot></div>
  </div>
</template>

<style>
.columnWrapper::-webkit-scrollbar {
  width: 0;
}
</style>
