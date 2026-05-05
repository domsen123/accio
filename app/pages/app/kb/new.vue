<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
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

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('kb.list.title'), to: '/app/kb' },
  { label: t('kb.form.create.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('kb.form.create.title')"
      :description="t('kb.form.create.subtitle')"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
    </UPageHeader>

    <UPage>
      <KbEntryForm
        @success="onSuccess"
        @cancel="onCancel"
      />
    </UPage>
  </UPage>
</template>
