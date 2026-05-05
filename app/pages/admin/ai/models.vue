<script setup lang="ts">
/**
 * Admin model registry — `/admin/ai/models` (T-3.1e, REQ-AI-3, ADR-015).
 *
 * Lists every model row across every provider (including disabled), with
 * inline enable / default toggles, edit, and delete. Adding a new model
 * opens a modal with the full form.
 *
 * Platform-admin only — gated by the `admin` middleware, same as every other
 * page under `/admin/**`. The server-side route guards (requireSuperAdmin)
 * are the real authority.
 */
import type { TableColumn } from '@nuxt/ui'
import type {
  AiModelWithProvider,
  CreateAiModelInput,
  UpdateAiModelInput,
} from '~/features/ai/types/ai.types'
import {
  useAdminAiModels,
  useAdminAiProviders,
  useAdminCreateAiModel,
  useAdminDeleteAiModel,
  useAdminUpdateAiModel,
  useAdminUpdateAiProvider,
} from '~/features/ai/composables/useAdminAiModels'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const { t } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('ai.admin.title'),
})

const { providers, isLoading: providersLoading } = useAdminAiProviders()
const { models, isLoading: modelsLoading } = useAdminAiModels()

const providerUpdate = useAdminUpdateAiProvider()
const modelCreate = useAdminCreateAiModel()
const modelUpdate = useAdminUpdateAiModel()
const modelDelete = useAdminDeleteAiModel()

const providerOptions = computed(() =>
  providers.value.map(p => ({ value: p.id, label: `${p.displayName} (${p.key})` })),
)

// ─── Inline toggles ────────────────────────────────────────────────────────
const togglingId = ref<string | null>(null)

const onToggleEnabled = async (model: AiModelWithProvider, enabled: boolean) => {
  togglingId.value = model.id
  try {
    await modelUpdate.mutateAsync({ id: model.id, data: { enabled } })
    toast.add({ title: t('ai.admin.toast.saved.title'), color: 'success' })
  }
  catch (err) {
    toast.add({
      title: t('ai.admin.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
  finally {
    togglingId.value = null
  }
}

const onToggleDefault = async (model: AiModelWithProvider, isDefault: boolean) => {
  togglingId.value = model.id
  try {
    await modelUpdate.mutateAsync({ id: model.id, data: { isDefault } })
    toast.add({ title: t('ai.admin.toast.saved.title'), color: 'success' })
  }
  catch (err) {
    toast.add({
      title: t('ai.admin.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
  finally {
    togglingId.value = null
  }
}

const onToggleProvider = async (providerId: string, enabled: boolean) => {
  try {
    await providerUpdate.mutateAsync({ id: providerId, data: { enabled } })
    toast.add({ title: t('ai.admin.toast.saved.title'), color: 'success' })
  }
  catch (err) {
    toast.add({
      title: t('ai.admin.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// ─── Create / edit modal ───────────────────────────────────────────────────
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  providerId: '',
  modelId: '',
  displayName: '',
  contextWindow: 200_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsVision: false,
  enabled: true,
  isDefault: false,
  inputPricePerMtok: '' as string,
  outputPricePerMtok: '' as string,
})

const resetForm = () => {
  editingId.value = null
  form.providerId = providers.value[0]?.id ?? ''
  form.modelId = ''
  form.displayName = ''
  form.contextWindow = 200_000
  form.supportsTools = true
  form.supportsStreaming = true
  form.supportsVision = false
  form.enabled = true
  form.isDefault = false
  form.inputPricePerMtok = ''
  form.outputPricePerMtok = ''
}

const openCreate = () => {
  resetForm()
  formOpen.value = true
}

const openEdit = (model: AiModelWithProvider) => {
  editingId.value = model.id
  form.providerId = model.providerId
  form.modelId = model.modelId
  form.displayName = model.displayName
  form.contextWindow = model.contextWindow
  form.supportsTools = model.supportsTools
  form.supportsStreaming = model.supportsStreaming
  form.supportsVision = model.supportsVision
  form.enabled = model.enabled
  form.isDefault = model.isDefault
  form.inputPricePerMtok = model.inputPricePerMtok ?? ''
  form.outputPricePerMtok = model.outputPricePerMtok ?? ''
  formOpen.value = true
}

const handleSubmitForm = async () => {
  try {
    if (editingId.value) {
      const patch: UpdateAiModelInput = {
        modelId: form.modelId.trim(),
        displayName: form.displayName.trim(),
        contextWindow: form.contextWindow,
        supportsTools: form.supportsTools,
        supportsStreaming: form.supportsStreaming,
        supportsVision: form.supportsVision,
        enabled: form.enabled,
        isDefault: form.isDefault,
        inputPricePerMtok: form.inputPricePerMtok.trim() || null,
        outputPricePerMtok: form.outputPricePerMtok.trim() || null,
      }
      await modelUpdate.mutateAsync({ id: editingId.value, data: patch })
    }
    else {
      const data: CreateAiModelInput = {
        providerId: form.providerId,
        modelId: form.modelId.trim(),
        displayName: form.displayName.trim(),
        contextWindow: form.contextWindow,
        supportsTools: form.supportsTools,
        supportsStreaming: form.supportsStreaming,
        supportsVision: form.supportsVision,
        enabled: form.enabled,
        isDefault: form.isDefault,
        inputPricePerMtok: form.inputPricePerMtok.trim() || null,
        outputPricePerMtok: form.outputPricePerMtok.trim() || null,
      }
      await modelCreate.mutateAsync(data)
    }
    toast.add({ title: t('ai.admin.toast.saved.title'), color: 'success' })
    formOpen.value = false
  }
  catch (err) {
    toast.add({
      title: t('ai.admin.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// Delete confirmation goes through a confirm modal (declared below).
const deleteTarget = ref<AiModelWithProvider | null>(null)
const deleteOpen = ref(false)

const requestDelete = (model: AiModelWithProvider) => {
  deleteTarget.value = model
  deleteOpen.value = true
}

const confirmDelete = async () => {
  const model = deleteTarget.value
  if (!model)
    return
  try {
    await modelDelete.mutateAsync(model.id)
    toast.add({ title: t('ai.admin.toast.deleted.title'), color: 'success' })
    deleteOpen.value = false
    deleteTarget.value = null
  }
  catch (err) {
    toast.add({
      title: t('ai.admin.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// ─── Table ────────────────────────────────────────────────────────────────
const columns: TableColumn<AiModelWithProvider>[] = [
  { accessorKey: 'providerKey', header: 'Provider' },
  { accessorKey: 'displayName', header: 'Model' },
  { accessorKey: 'contextWindow', header: 'Context' },
  { id: 'capabilities', header: 'Capabilities' },
  { id: 'enabled', header: 'Enabled' },
  { id: 'isDefault', header: 'Default' },
  { id: 'actions' },
]

const isLoading = computed(() => providersLoading.value || modelsLoading.value)
</script>

<template>
  <DashboardAdminPage :title="t('ai.admin.title')">
    <div class="space-y-6">
      <!-- Provider toggle bar -->
      <UCard v-if="providers.length > 0">
        <template #header>
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                {{ t('ai.admin.providers.title') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('ai.admin.providers.subtitle') }}
              </p>
            </div>
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="provider in providers"
            :key="provider.id"
            class="flex items-center justify-between py-3 gap-3"
          >
            <div>
              <p class="font-medium text-highlighted">
                {{ provider.displayName }}
              </p>
              <p class="text-xs text-muted">
                {{ provider.key }}
              </p>
            </div>
            <USwitch
              :model-value="provider.enabled"
              :label="provider.enabled
                ? t('ai.admin.providers.enabled')
                : t('ai.admin.providers.disabled')"
              @update:model-value="(v: boolean) => onToggleProvider(provider.id, v)"
            />
          </li>
        </ul>
      </UCard>

      <!-- Models table -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                {{ t('ai.admin.models.title') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('ai.admin.models.subtitle') }}
              </p>
            </div>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              :label="t('ai.admin.models.create')"
              :disabled="providers.length === 0"
              @click="openCreate"
            />
          </div>
        </template>

        <div v-if="isLoading" class="space-y-2">
          <USkeleton class="h-8 w-full" />
          <USkeleton class="h-8 w-full" />
        </div>

        <UTable
          v-else
          :data="models"
          :columns="columns"
          :empty-state="{ icon: 'i-lucide-bot', label: t('ai.admin.models.empty') }"
        >
          <template #providerKey-cell="{ row }">
            <span class="text-sm">{{ row.original.providerDisplayName }}</span>
            <span class="block text-xs text-muted">{{ row.original.providerKey }}</span>
          </template>

          <template #displayName-cell="{ row }">
            <span class="font-medium text-highlighted">{{ row.original.displayName }}</span>
            <span class="block text-xs text-muted">{{ row.original.modelId }}</span>
          </template>

          <template #contextWindow-cell="{ row }">
            <span class="text-xs">{{ row.original.contextWindow.toLocaleString() }}</span>
          </template>

          <template #capabilities-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge v-if="row.original.supportsTools" size="xs" color="primary" variant="subtle">
                {{ t('ai.admin.capabilities.tools') }}
              </UBadge>
              <UBadge v-if="row.original.supportsStreaming" size="xs" color="info" variant="subtle">
                {{ t('ai.admin.capabilities.streaming') }}
              </UBadge>
              <UBadge v-if="row.original.supportsVision" size="xs" color="success" variant="subtle">
                {{ t('ai.admin.capabilities.vision') }}
              </UBadge>
            </div>
          </template>

          <template #enabled-cell="{ row }">
            <USwitch
              :model-value="row.original.enabled"
              :loading="togglingId === row.original.id"
              @update:model-value="(v: boolean) => onToggleEnabled(row.original, v)"
            />
          </template>

          <template #isDefault-cell="{ row }">
            <USwitch
              :model-value="row.original.isDefault"
              :loading="togglingId === row.original.id"
              @update:model-value="(v: boolean) => onToggleDefault(row.original, v)"
            />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                :aria-label="t('ai.admin.actions.edit')"
                @click="openEdit(row.original)"
              />
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash"
                :aria-label="t('ai.admin.actions.delete')"
                @click="requestDelete(row.original)"
              />
            </div>
          </template>
        </UTable>
      </UCard>
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editingId ? t('ai.admin.form.edit_title') : t('ai.admin.form.create_title')"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('ai.admin.form.provider')">
            <USelectMenu
              v-model="form.providerId"
              :items="providerOptions"
              value-key="value"
              label-key="label"
              :disabled="!!editingId"
            />
          </UFormField>
          <UFormField :label="t('ai.admin.form.modelId')" :description="t('ai.admin.form.modelId_help')">
            <UInput v-model="form.modelId" />
          </UFormField>
          <UFormField :label="t('ai.admin.form.displayName')">
            <UInput v-model="form.displayName" />
          </UFormField>
          <UFormField :label="t('ai.admin.form.contextWindow')">
            <UInput v-model.number="form.contextWindow" type="number" :min="1" />
          </UFormField>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <UFormField :label="t('ai.admin.form.inputPrice')">
              <UInput v-model="form.inputPricePerMtok" :placeholder="t('ai.admin.form.price_placeholder')" />
            </UFormField>
            <UFormField :label="t('ai.admin.form.outputPrice')">
              <UInput v-model="form.outputPricePerMtok" :placeholder="t('ai.admin.form.price_placeholder')" />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UCheckbox v-model="form.supportsTools" :label="t('ai.admin.capabilities.tools_label')" />
            <UCheckbox v-model="form.supportsStreaming" :label="t('ai.admin.capabilities.streaming_label')" />
            <UCheckbox v-model="form.supportsVision" :label="t('ai.admin.capabilities.vision_label')" />
            <UCheckbox v-model="form.enabled" :label="t('ai.admin.form.enabled')" />
            <UCheckbox v-model="form.isDefault" :label="t('ai.admin.form.isDefault')" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="formOpen = false" />
          <UButton
            color="primary"
            :label="t('common.save')"
            :loading="modelCreate.asyncStatus.value === 'loading' || modelUpdate.asyncStatus.value === 'loading'"
            :disabled="!form.providerId || !form.modelId || !form.displayName"
            @click="handleSubmitForm"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" :title="t('ai.admin.actions.delete')">
      <template #body>
        <p class="text-sm text-muted">
          {{ deleteTarget ? t('ai.admin.confirm.delete', { name: deleteTarget.displayName }) : '' }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="deleteOpen = false" />
          <UButton
            color="error"
            :label="t('ai.admin.actions.delete')"
            :loading="modelDelete.asyncStatus.value === 'loading'"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </DashboardAdminPage>
</template>
