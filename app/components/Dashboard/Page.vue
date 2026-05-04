<script lang="ts" setup>
defineProps<{
  title: string
}>()
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ right: 'gap-3' }" class="bg-elevated/75">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <slot name="header:append">
      </slot>
    </template>
    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
