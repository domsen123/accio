<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({
  auth: true,
})

const links: NavigationMenuItem[][] = [[
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/settings',
    exact: true,
  },
  {
    label: 'Security',
    icon: 'i-lucide-shield',
    to: '/settings/security',
  },
]]
</script>

<template>
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <UNavigationMenu :items="links" orientation="vertical" highlight />
        </UPageAside>
      </template>
      <UPageHeader title="Settings" />

      <UPageBody>
        <div class="max-w-3xl">
          <NuxtPage />
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
