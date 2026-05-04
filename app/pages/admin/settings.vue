<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  redirect: ROUTES.admin.settingsAuthentication,
})
</script>

<template>
  <DashboardAdminPage title="Settings">
    <NuxtPage />
  </DashboardAdminPage>
</template>
