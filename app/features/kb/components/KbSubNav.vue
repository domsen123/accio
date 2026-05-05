<script setup lang="ts">
/**
 * KB sub-navigation (T-1.10).
 *
 * Horizontal tab strip rendered on each KB top-level page (`/app/kb`,
 * `/app/kb/inbox`, `/app/kb/trash`). Placed inside the page (just under the
 * page title) rather than in the global side nav, since these are
 * KB-internal sub-views. Active route is highlighted.
 *
 * Rationale (vs nesting under the side nav): the tab strip is the
 * lower-friction option and matches typical "inbox triage" UX where the
 * user is already on a KB page. It also keeps the global side nav scoped
 * to feature-level entries.
 */
const { t } = useI18n()
const route = useRoute()

const tabs = computed(() => [
  { key: 'all', to: '/app/kb', label: t('kb.subnav.all') },
  { key: 'inbox', to: '/app/kb/inbox', label: t('kb.subnav.inbox') },
  { key: 'trash', to: '/app/kb/trash', label: t('kb.subnav.trash') },
])

const isActive = (to: string): boolean => {
  // Exact match for the list page (so `/app/kb/inbox` doesn't also light
  // up "All"); prefix match for sub-routes would be wrong here because
  // `/app/kb/<slug>` should not highlight any tab.
  return route.path === to
}
</script>

<template>
  <div class="border-b border-default">
    <nav class="flex items-center gap-1 -mb-px" aria-label="KB sub-navigation">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.to"
        class="inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 transition-colors"
        :class="
          isActive(tab.to)
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-default hover:border-muted'
        "
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
