<script setup lang="ts">
/**
 * KB entry detail page (T-1.8) — `/app/kb/[slug]`.
 *
 * Renders title, metadata (status / author / source / category / tags), the
 * Markdown body, and a Backlinks panel.
 *
 * Markdown rendering is intentionally minimal here: a `<div>` with
 * `whitespace-pre-wrap` over the raw `bodyMd`. The proper editor + preview
 * pair (with wikilink resolution) lands in T-1.9, at which point this page
 * will swap in the renderer. Keeping the placeholder dependency-free avoids
 * pulling a Markdown library twice.
 *
 * Edit / Delete buttons link to the (not-yet-implemented) edit page; T-1.9
 * fills those in.
 */
import type { KbEntryStatus } from '~/features/kb/types/kb.types'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const route = useRoute()

const slug = computed(() => String(route.params.slug ?? ''))

const { entry, isLoading, error } = useKbEntry(slug)

const entryId = computed(() => entry.value?.id ?? null)
const { backlinks } = useKbBacklinks(entryId)

useSeoMeta({
  title: () => entry.value?.title ?? t('kb.detail.title.fallback'),
})

const statusBadgeColor = (value: KbEntryStatus) => {
  switch (value) {
    case 'inbox': return 'warning' as const
    case 'draft': return 'neutral' as const
    case 'verified': return 'success' as const
    case 'archived': return 'neutral' as const
  }
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return ''
  return d.toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-4xl">
    <!-- Back link -->
    <UButton
      to="/app/kb"
      variant="ghost"
      color="neutral"
      icon="i-lucide-arrow-left"
      size="sm"
      :label="t('kb.detail.back')"
    />

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-8 w-3/4" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-64 w-full" />
    </div>

    <!-- Error / not found -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="t('kb.detail.error.title')"
      :description="error.message"
      icon="i-lucide-alert-circle"
    />

    <!-- Entry -->
    <template v-else-if="entry">
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <h1 class="text-2xl md:text-3xl font-bold text-highlighted">
            {{ entry.title }}
          </h1>
          <div class="flex items-center gap-2">
            <UButton
              variant="outline"
              color="neutral"
              icon="i-lucide-pencil"
              :label="t('kb.detail.edit')"
              :to="`/app/kb/${encodeURIComponent(entry.slug)}/edit`"
            />
            <UButton
              variant="outline"
              color="error"
              icon="i-lucide-trash-2"
              :label="t('kb.detail.delete')"
              disabled
            />
          </div>
        </div>

        <!-- Metadata row -->
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge
            :color="statusBadgeColor(entry.status)"
            variant="subtle"
            size="sm"
          >
            {{ t(`kb.status.${entry.status}`) }}
          </UBadge>
          <UBadge
            v-if="entry.category"
            variant="outline"
            size="sm"
            icon="i-lucide-folder"
          >
            {{ entry.category.name }}
          </UBadge>
          <UBadge
            v-for="tag in entry.tags ?? []"
            :key="tag.id"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ tag.name }}
          </UBadge>
          <span class="inline-flex items-center gap-1">
            <UIcon
              :name="entry.authorType === 'ai' ? 'i-lucide-sparkles' : 'i-lucide-user'"
              class="size-3.5"
            />
            {{ t(`kb.author.${entry.authorType}`) }}
            <span v-if="entry.authorName">— {{ entry.authorName }}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-link" class="size-3.5" />
            {{ t(`kb.source.${entry.sourceType}`) }}
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-clock" class="size-3.5" />
            {{ t('kb.detail.updatedAt', { date: formatDate(entry.updatedAt) }) }}
          </span>
        </div>
      </div>

      <!-- Body (markdown placeholder; T-1.9 swaps in the renderer) -->
      <UCard>
        <div
          v-if="entry.bodyMd"
          class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-default"
        >
          {{ entry.bodyMd }}
        </div>
        <p v-else class="italic text-muted text-sm">
          {{ t('kb.detail.body.empty') }}
        </p>
      </UCard>

      <!-- Backlinks -->
      <section class="space-y-2">
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('kb.detail.backlinks.title') }}
        </h2>
        <div v-if="backlinks.length === 0" class="text-sm text-muted">
          {{ t('kb.detail.backlinks.empty') }}
        </div>
        <ul v-else class="space-y-1">
          <li
            v-for="b in backlinks"
            :key="b.id"
          >
            <NuxtLink
              :to="`/app/kb/${encodeURIComponent(b.slug)}`"
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <UIcon name="i-lucide-corner-up-left" class="size-3.5" />
              {{ b.title }}
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
