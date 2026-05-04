<script lang="ts" setup>
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  redirect: ROUTES.admin.blogPosts,
})

const items = [
  { label: 'Posts', icon: 'i-lucide-file-text', to: ROUTES.admin.blogPosts },
  { label: 'Categories', icon: 'i-lucide-folder', to: ROUTES.admin.blogCategories },
  { label: 'Tags', icon: 'i-lucide-tag', to: ROUTES.admin.blogTags },
  { label: 'Content Creator', icon: 'i-lucide-sparkles', to: ROUTES.admin.blogContentCreator },
]
</script>

<template>
  <DashboardAdminPage title="Blog">
    <template #header:append>
      <UDashboardToolbar class="bg-elevated/50">
        <UNavigationMenu
          highlight
          :items="items"
        />
      </UDashboardToolbar>
    </template>
    <NuxtPage />
  </DashboardAdminPage>
</template>

<style></style>
