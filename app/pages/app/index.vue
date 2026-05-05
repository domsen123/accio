<script setup lang="ts">
// Hub landing page (/app). Minimal welcome + quick-stats placeholder grid.
// Stats are hard-coded zeros for now; each card wires up to its feature
// composable when that feature lands (KB count, Todos count, recent activity).

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('app.welcome.title'),
})

// TODO: replace hard-coded zeros with real counts once features are in.
const stats = computed(() => [
  {
    label: t('app.welcome.stats.kb'),
    value: 0,
    icon: 'i-lucide-book-open',
  },
  {
    label: t('app.welcome.stats.todos'),
    value: 0,
    icon: 'i-lucide-list-todo',
  },
  {
    label: t('app.welcome.stats.activity'),
    value: 0,
    icon: 'i-lucide-activity',
  },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('app.welcome.title')"
      :description="t('app.welcome.subtitle')"
      :ui="{ root: 'border-none' }"
    />

    <UPage>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard
          v-for="stat in stats"
          :key="stat.label"
          :ui="{ root: 'gap-3', body: 'flex items-center gap-3' }"
        >
          <div class="inline-flex items-center justify-center size-10 rounded-full bg-primary/10 ring ring-inset ring-primary/25">
            <UIcon :name="stat.icon" class="size-5 text-primary" />
          </div>
          <div>
            <p class="text-xs uppercase text-muted font-medium">
              {{ stat.label }}
            </p>
            <p class="text-2xl font-semibold text-highlighted">
              {{ stat.value }}
            </p>
          </div>
        </UCard>
      </div>
    </UPage>
  </UPage>
</template>
