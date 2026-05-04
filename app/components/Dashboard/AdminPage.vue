<script lang="ts" setup>
import type { BreadcrumbItem } from '@nuxt/ui'

defineProps<{
  title: string
  breadcrumb?: BreadcrumbItem[]
}>()
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ right: 'gap-3' }" class="bg-elevated/75">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template v-if="breadcrumb" #title>
          <UBreadcrumb :items="breadcrumb" />
        </template>
        <template v-if="$slots.trailing" #trailing>
          <slot name="trailing" />
        </template>
      </UDashboardNavbar>
      <slot name="header:append" />
    </template>
    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
