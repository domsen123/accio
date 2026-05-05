<script setup lang="ts">
import type { KbEntry } from '~/features/kb/types/kb.types'
/**
 * KB entry create page (T-1.9) — `/app/kb/new`.
 *
 * Mounts the shared `KbEntryForm` in create mode and navigates to the new
 * entry's detail page on success. The form owns its own toast for the
 * create/update outcome; this page only handles navigation.
 */
import KbEntryForm from '~/features/kb/components/KbEntryForm.vue'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const router = useRouter()

useSeoMeta({
  title: () => t('kb.form.create.title'),
})

const onSuccess = (entry: KbEntry) => {
  router.push(`/app/kb/${encodeURIComponent(entry.slug)}`)
}

const onCancel = () => {
  router.push('/app/kb')
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('kb.form.create.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ t('kb.form.create.subtitle') }}
        </p>
      </div>
      <UButton
        to="/app/kb"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('kb.detail.back')"
      />
    </div>
    <KbEntryForm
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
