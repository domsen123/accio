<script setup lang="ts">
import type { ContentCreatorCluster, ContentCreatorPillar } from '../types/admin.types'

const props = defineProps<{
  pillars: ContentCreatorPillar[]
}>()

const toast = useToast()

const selectedPillarId = ref<string>('all')
const clusterParams = computed(() => ({
  pillarId: selectedPillarId.value === 'all' ? undefined : selectedPillarId.value,
}))

const { clusters, isLoading } = useContentCreatorClusters(clusterParams)
const { mutateAsync: updateCluster } = useUpdateContentCreatorCluster()
const { mutateAsync: deleteCluster } = useDeleteContentCreatorCluster()
const { mutateAsync: generateContent, asyncStatus: generateContentStatus } = useGenerateContentCreatorClusterContent()

const generatingClusterId = ref<string | null>(null)

const confirmedPillars = computed(() =>
  props.pillars.filter(p => p.status === 'confirmed'),
)

const statusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'info'
    case 'queued': return 'warning'
    case 'generating': return 'primary'
    case 'generated': return 'success'
    case 'failed': return 'error'
    default: return 'neutral'
  }
}

const parseKeywords = (keywords: string | null) => {
  if (!keywords)
    return []
  return keywords.split(',').map(k => k.trim()).filter(Boolean)
}

const onApprove = async (cluster: ContentCreatorCluster) => {
  try {
    await updateCluster({ id: cluster.id, data: { status: 'approved' } })
    toast.add({ title: 'Cluster approved', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to approve cluster', color: 'error' })
  }
}

const onQueue = async (cluster: ContentCreatorCluster) => {
  const scheduledFor = new Date()
  scheduledFor.setDate(scheduledFor.getDate() + 1)

  try {
    await updateCluster({
      id: cluster.id,
      data: { status: 'queued', scheduledFor: scheduledFor.toISOString() },
    })
    toast.add({ title: 'Cluster queued', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to queue cluster', color: 'error' })
  }
}

const onGenerateContent = async (cluster: ContentCreatorCluster) => {
  generatingClusterId.value = cluster.id
  try {
    await generateContent(cluster.id)
    toast.add({ title: 'Content generated', description: 'A draft blog post has been created.', color: 'success' })
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Content generation failed',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
  finally {
    generatingClusterId.value = null
  }
}

const onDelete = async (cluster: ContentCreatorCluster) => {
  try {
    await deleteCluster(cluster.id)
    toast.add({ title: 'Cluster deleted', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to delete cluster', color: 'error' })
  }
}

const formatDate = (dateString: string | null) => {
  if (!dateString)
    return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <USelect
        v-model="selectedPillarId"
        :items="[{ label: 'All Pillars', value: 'all' }, ...confirmedPillars.map(p => ({ label: p.name, value: p.id }))]"
        value-key="value"
        placeholder="Filter by pillar"
        class="w-64"
      />
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
    </div>

    <UPageCard v-else-if="clusters.length === 0" variant="subtle">
      <div class="text-center py-4">
        <UIcon name="i-lucide-layers" class="size-10 text-muted mx-auto mb-2" />
        <p class="text-sm text-muted">
          No clusters yet. Generate clusters from confirmed pillars in the Strategy tab.
        </p>
      </div>
    </UPageCard>

    <div v-else class="space-y-3">
      <UPageCard v-for="cluster in clusters" :key="cluster.id" variant="subtle">
        <div class="flex items-start gap-4">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
            <UIcon name="i-lucide-layers" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h4 class="text-sm font-semibold text-highlighted truncate">
                {{ cluster.title }}
              </h4>
              <UBadge :color="statusColor(cluster.status)" variant="subtle" size="xs">
                {{ cluster.status }}
              </UBadge>
            </div>
            <p v-if="cluster.description" class="text-sm text-muted line-clamp-2 mb-2">
              {{ cluster.description }}
            </p>
            <div v-if="cluster.keywords" class="flex flex-wrap gap-1 mb-2">
              <UBadge
                v-for="keyword in parseKeywords(cluster.keywords)"
                :key="keyword"
                variant="subtle"
                color="neutral"
                size="xs"
              >
                {{ keyword }}
              </UBadge>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span v-if="cluster.pillar">{{ cluster.pillar.name }}</span>
              <template v-if="cluster.scheduledFor">
                <span class="text-muted/50">&middot;</span>
                <span>Scheduled: {{ formatDate(cluster.scheduledFor) }}</span>
              </template>
              <template v-if="cluster.generatedAt">
                <span class="text-muted/50">&middot;</span>
                <span>Generated: {{ formatDate(cluster.generatedAt) }}</span>
              </template>
            </div>
            <p v-if="cluster.errorMessage" class="text-xs text-error mt-1">
              Error: {{ cluster.errorMessage }}
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              v-if="cluster.status === 'idea'"
              size="xs"
              variant="soft"
              icon="i-lucide-check"
              @click="onApprove(cluster)"
            >
              Approve
            </UButton>
            <UButton
              v-if="cluster.status === 'approved'"
              size="xs"
              variant="soft"
              color="warning"
              icon="i-lucide-clock"
              @click="onQueue(cluster)"
            >
              Queue
            </UButton>
            <UButton
              v-if="['approved', 'failed'].includes(cluster.status)"
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-sparkles"
              :loading="generatingClusterId === cluster.id"
              :disabled="generateContentStatus === 'loading'"
              @click="onGenerateContent(cluster)"
            >
              Generate
            </UButton>
            <UButton
              v-if="cluster.status === 'generated'"
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-refresh-cw"
              :loading="generatingClusterId === cluster.id"
              :disabled="generateContentStatus === 'loading'"
              @click="onGenerateContent(cluster)"
            >
              Recreate
            </UButton>
            <UButton
              v-if="cluster.status === 'generated' && cluster.blogPostId"
              size="xs"
              variant="soft"
              icon="i-lucide-external-link"
              :to="ROUTES.admin.blogPostEdit(cluster.blogPostId)"
            >
              View Post
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              @click="onDelete(cluster)"
            />
          </div>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
