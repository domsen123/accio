<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()
const userId = computed(() => route.params.id as string)

const { user } = useAdminUser(userId)
</script>

<template>
  <DashboardAdminPage :title="user?.name || user?.email || 'User'">
    <NuxtPage />
  </DashboardAdminPage>
</template>
