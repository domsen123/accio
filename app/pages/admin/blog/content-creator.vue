<script setup lang="ts">
import { useRouteQuery } from '@vueuse/router'

useSeoMeta({
  title: 'Content Creator - Admin',
})

const toast = useToast()

const { settings } = useContentCreatorSettings()
const { pillars } = useContentCreatorPillars()
const { mutateAsync: updatePillar } = useUpdateContentCreatorPillar()
const { mutateAsync: deletePillar } = useDeleteContentCreatorPillar()
const { mutateAsync: generateClusters, asyncStatus: generateClustersStatus } = useGenerateContentCreatorClusters()

const isConnected = computed(() => !!settings.value?.hasApiKey)
const activeTab = useRouteQuery<string>('tab', 'settings')

const navItems = computed(() => [
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: { query: { tab: 'settings' } },
    active: activeTab.value === 'settings',
  },
  {
    label: 'Strategy',
    icon: 'i-lucide-target',
    to: { query: { tab: 'strategy' } },
    active: activeTab.value === 'strategy',
    disabled: !isConnected.value,
  },
  {
    label: 'Clusters',
    icon: 'i-lucide-layers',
    to: { query: { tab: 'clusters' } },
    active: activeTab.value === 'clusters',
    disabled: !isConnected.value,
  },
  {
    label: 'Queue',
    icon: 'i-lucide-clock',
    to: { query: { tab: 'queue' } },
    active: activeTab.value === 'queue',
    disabled: !isConnected.value,
  },
])

const onConnected = () => {
  activeTab.value = 'strategy'
}

const onConfirmPillar = async (id: string) => {
  try {
    await updatePillar({ id, action: 'confirm' })
    toast.add({ title: 'Pillar confirmed', description: 'Blog category created.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to confirm pillar', color: 'error' })
  }
}

const onRejectPillar = async (id: string) => {
  try {
    await updatePillar({ id, action: 'reject' })
    toast.add({ title: 'Pillar rejected', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to reject pillar', color: 'error' })
  }
}

const onDeletePillar = async (id: string) => {
  try {
    await deletePillar(id)
    toast.add({ title: 'Pillar deleted', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to delete pillar', color: 'error' })
  }
}

const onExpandPillar = async (id: string) => {
  try {
    await generateClusters(id)
    toast.add({ title: 'Clusters generated', color: 'success' })
    activeTab.value = 'clusters'
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Failed to generate clusters',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <template #left>
      <DashboardPageAside>
        <UNavigationMenu
          :items="navItems"
          orientation="vertical"
        />
      </DashboardPageAside>
    </template>
    <UPageBody>
      <!-- Settings Tab -->
      <div v-if="activeTab === 'settings'">
        <ContentCreatorSettingsForm @connected="onConnected" />
      </div>

      <!-- Strategy Tab -->
      <div v-else-if="activeTab === 'strategy'" class="space-y-6">
        <ContentCreatorPillarGenerator />

        <div v-if="pillars.length > 0" class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-target" class="size-4 text-primary" />
            <h3 class="text-sm font-semibold text-highlighted">
              Content Pillars
            </h3>
          </div>
          <ContentCreatorPillarCard
            v-for="pillar in pillars"
            :key="pillar.id"
            :pillar="pillar"
            @confirm="onConfirmPillar"
            @reject="onRejectPillar"
            @delete="onDeletePillar"
            @expand="onExpandPillar"
          />
          <p v-if="generateClustersStatus === 'loading'" class="text-sm text-muted">
            Generating clusters with AI... This may take a moment.
          </p>
        </div>
      </div>

      <!-- Clusters Tab -->
      <div v-else-if="activeTab === 'clusters'">
        <ContentCreatorClusterTable :pillars="pillars" />
      </div>

      <!-- Queue Tab -->
      <div v-else-if="activeTab === 'queue'">
        <ContentCreatorQueuePanel />
      </div>
    </UPageBody>
  </UPage>
</template>
