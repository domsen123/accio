<script lang="ts" setup>
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

interface MenuItem {
  label: string
  icon?: string
  color?: 'error' | 'primary' | 'neutral' | 'success' | 'warning' | 'info'
  click?: () => void
}

interface DropdownMenuItem {
  label: string
  icon?: string
  color?: 'error' | 'primary' | 'neutral' | 'success' | 'warning' | 'info'
  onSelect?: () => void
}

const props = defineProps<{
  items: MenuItem[][] | MenuItem[]
  title?: string
}>()

// Map color to Tailwind class
const getColorClass = (color?: MenuItem['color']) => {
  switch (color) {
    case 'error': return 'text-error'
    case 'success': return 'text-success'
    case 'warning': return 'text-warning'
    case 'primary': return 'text-primary'
    case 'info': return 'text-info'
    default: return ''
  }
}

const getIconColorClass = (color?: MenuItem['color']) => {
  switch (color) {
    case 'error': return 'text-error'
    case 'success': return 'text-success'
    case 'warning': return 'text-warning'
    case 'primary': return 'text-primary'
    case 'info': return 'text-info'
    default: return 'text-muted'
  }
}

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

const isOpen = ref(false)

// Normalize items to always be nested array
const normalizedItems = computed(() => {
  if (props.items.length === 0)
    return []
  // Check if first item is an array (grouped) or object (flat)
  if (Array.isArray(props.items[0])) {
    return props.items as MenuItem[][]
  }
  return [props.items as MenuItem[]]
})

// Transform items for UDropdownMenu (uses onSelect instead of click)
const dropdownItems = computed(() => {
  return normalizedItems.value.map(group =>
    group.map((item): DropdownMenuItem => ({
      label: item.label,
      icon: item.icon,
      color: item.color,
      onSelect: item.click,
    })),
  )
})

const handleItemClick = (item: MenuItem) => {
  if (item.click) {
    item.click()
  }
  isOpen.value = false
}
</script>

<template>
  <div>
    <!-- Desktop: Normal Dropdown -->
    <UDropdownMenu
      v-if="!isMobile"
      :items="dropdownItems"
      :content="{ align: 'end' }"
      :ui="{ content: 'bg-default dark:bg-elevated' }"
    >
      <slot />
    </UDropdownMenu>

    <!-- Mobile: Button + Bottom Drawer -->
    <template v-else>
      <div @click.capture.stop="isOpen = true">
        <slot />
      </div>

      <UDrawer v-model:open="isOpen" :title="title" handle-only :ui="{ content: 'bg-default dark:bg-elevated' }">
        <template #body>
          <div class="flex flex-col gap-1">
            <template v-for="(group, groupIndex) in normalizedItems" :key="groupIndex">
              <USeparator v-if="groupIndex > 0" class="my-2" />
              <button
                v-for="(item, itemIndex) in group"
                :key="itemIndex"
                class="flex items-center gap-3 w-full p-3 rounded-lg text-left active:bg-elevated transition-colors"
                :class="getColorClass(item.color)"
                @click="handleItemClick(item)"
              >
                <UIcon v-if="item.icon" :name="item.icon" class="size-5" :class="getIconColorClass(item.color)" />
                <span class="text-base">{{ item.label }}</span>
              </button>
            </template>
          </div>
        </template>
      </UDrawer>
    </template>
  </div>
</template>
