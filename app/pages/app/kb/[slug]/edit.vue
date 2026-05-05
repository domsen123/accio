<script setup lang="ts">
import type { KbEntry } from '~/features/kb/types/kb.types'
/**
 * KB entry edit page (T-1.9) — `/app/kb/[slug]/edit`.
 *
 * Loads the entry by slug via the existing `useKbEntry` composable, renders
 * the shared `KbEntryForm` in edit mode, and navigates back to the detail
 * page on success. The slug is stable across edits per REQ-KB-1, so the
 * post-save redirect can reuse the URL slug.
 */
import KbEntryForm from '~/features/kb/components/KbEntryForm.vue'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const slug = computed(() => String(route.params.slug ?? ''))

const { entry, isLoading, error } = useKbEntry(slug)

useSeoMeta({
  title: () => entry.value
    ? t('kb.form.edit.title', { title: entry.value.title })
    : t('kb.form.edit.fallback'),
})

const onSuccess = (saved: KbEntry) => {
  router.push(`/app/kb/${encodeURIComponent(saved.slug)}`)
}

const onCancel = () => {
  if (entry.value)
    router.push(`/app/kb/${encodeURIComponent(entry.value.slug)}`)
  else
    router.push('/app/kb')
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('kb.form.edit.heading') }}
        </h1>
        <p v-if="entry" class="text-muted text-sm mt-1 truncate max-w-2xl">
          {{ entry.title }}
        </p>
      </div>
      <UButton
        :to="entry ? `/app/kb/${encodeURIComponent(entry.slug)}` : '/app/kb'"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('kb.form.edit.backToEntry')"
      />
    </div>

    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-8 w-3/4" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('kb.detail.error.title')"
      :description="error.message"
    />

    <KbEntryForm
      v-else-if="entry"
      :entry="entry"
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
