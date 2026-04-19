<script setup lang="ts">
import { useSettingStore } from '@/stores/settings'
const settingsStore = useSettingStore()
</script>

<template>
  <div
    class="overflow-auto shadow-lg border-t-4 bg-white mb-4 rounded-l-lg rounded-t border-header w-full md:w-1/4"
  >
    <div class="px-6 py-4 mt-4 mb-8">
      <h3>Result table settings</h3>
      <form>
        <div class="mb-6">
          <h4>Column number</h4>
          <div class="flex flex-col items-start mb-2">
            <label
              for="scroll-columns-count"
              class="hidden block mb-1 mr-2 text-sm font-medium text-gray-900 dark:text-white"
              >Column number</label
            >
            <input
              :value="settingsStore.scrollColumnsCount"
              @input="(e) => settingsStore.setScrollColumnsCount(parseInt((e.target as HTMLInputElement).value))
              "
              id="scroll-columns-count"
              type="number"
              min="1"
              max="10"
              step="1"
              class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            />
          </div>

          <h4>(Auto) Scrolling</h4>
          <div class="flex items-center mb-2">
            <input
              v-model="settingsStore.scrollType"
              id="scroll-page"
              type="radio"
              value="page"
              name="scroll by page"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="scroll-page"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Scroll by page</label
            >
          </div>
          <div class="flex items-center mb-2">
            <input
              v-model="settingsStore.scrollType"
              id="scroll-row"
              type="radio"
              value="row"
              name="scroll by row"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="scroll-row"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Scroll by row</label
            >
          </div>
          <div class="flex items-center mb-2">
            <input
              v-model="settingsStore.scrollType"
              id="scroll-continues"
              type="radio"
              value="continues"
              name="scroll continuesly"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="scroll-continues"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Continues scroll</label
            >
          </div>
          <div class="flex items-center mb-2">
            <input
              v-model="settingsStore.scrollType"
              id="scroll-none"
              type="radio"
              value="none"
              name="scroll manually"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="scroll-none"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Manual scroll</label
            >
          </div>

          <h4>Scroll speed (time per result line)</h4>
          <div class="flex items-center mb-2">
            <label
              for="scroll-speed"
              class="block mb-1 mr-2 text-sm font-medium text-gray-900 dark:text-white"
              >{{ settingsStore.readLineTimeSeconds }}s</label
            >
            <input
              v-model="settingsStore.readLineTimeSeconds"
              id="scroll-speed"
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>

          <h4>Table content</h4>

          <div class="flex items-center mb-2">
            <input
              id="unfinished-checkbox"
              type="checkbox"
              v-model="settingsStore.showUnfinishedAthletes"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="unfinished-checkbox"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Show unfinished (startlist, running)</label
            >
          </div>

          <div class="flex items-center mb-2">
            <input
              id="compact-checkbox"
              type="checkbox"
              v-model="settingsStore.compactMode"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="compact-checkbox"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Compact mode (no club, card)</label
            >
          </div>

          <div class="flex items-center mb-2">
            <input
              id="compact-checkbox"
              type="checkbox"
              v-model="settingsStore.showEmojis"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label
              for="compact-checkbox"
              class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >Show Emojis in table</label
            >
          </div>

          <h5>Displayed classes</h5>
          <div class="flex flex-col flex-wrap gap-y-2">
            <div
              v-for="category in settingsStore.categoriesDisplay"
              :key="category.name"
              class="grid grid-cols-5 gap-2"
            >
              <label
                :for="`show-category-${category.name}`"
                class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                >{{ category.name }}</label
              >
              <input
                :id="`show-category-${category.name}`"
                type="checkbox"
                :checked="category.selected"
                @change="() => settingsStore.setCategorySelected(category)"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <input
                :value="category.column"
                @input="(e) => settingsStore.setCategoryDisplayColumn(category, parseInt((e.target as HTMLInputElement).value))
                "
                type="number"
                min="1"
                :max="settingsStore.scrollColumnsCount"
                step="1"
                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1"
              />
              <button
                :disabled="category.order === 0"
                @click.prevent="
                  () => settingsStore.setCategoryDisplayOrder(category, true)
                "
              >
                Up
              </button>
              <button
                :disabled="
                  category.order === settingsStore.categoriesDisplay.length - 1
                "
                @click.prevent="
                  () => settingsStore.setCategoryDisplayOrder(category, false)
                "
              >
                Down
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
