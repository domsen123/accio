<script setup lang="ts">
/**
 * Entry detail / edit form (T-V-26, REQ-VAULT-7, REQ-VAULT-8,
 * REQ-VAULT-12, REQ-VAULT-19).
 *
 * Reads the decrypted payload via `useVaultEntry` (or a fresh blank for
 * "new" entries), renders fixed fields plus an arbitrary number of
 * custom fields, and submits as a single PATCH or POST. Reveal toggles
 * call `/api/vault/entries/[id]/reveal` to log `ui_reveal` events;
 * copy buttons go through `useSecretClipboard` which auto-clears the
 * clipboard after 30s (best-effort).
 */
import type { CustomField, PlainEntryPayload, VaultEntryDetail } from '../types/vault.types'
import { useVaultApi } from '../api/vault.api'
import { useSecretClipboard } from '../composables/useSecretClipboard'
import {
  useCreateVaultEntry,
  useUpdateVaultEntry,
  useVaultEntry,
  useVaultFolders,
} from '../composables/useVaultEntries'
import { folderPath } from '../utils/folderTree'

const props = defineProps<{
  entryId: string | null
  initialFolderId?: string | null
}>()

const emit = defineEmits<{
  saved: [entryId: string]
  cancelled: []
}>()

const { t } = useI18n()
const router = useRouter()
const api = useVaultApi()

const isNew = computed(() => props.entryId === null)
const entryQuery = useVaultEntry(() => props.entryId)
const folders = useVaultFolders()

const create = useCreateVaultEntry()
const update = useUpdateVaultEntry()

const title = ref('')
const folderId = ref<string | null>(props.initialFolderId ?? null)
const tagNames = ref<string[]>([])
const newTag = ref('')
const username = ref('')
const password = ref('')
const url = ref('')
const notes = ref('')
const customFields = ref<CustomField[]>([])

const revealed = reactive<Record<string, boolean>>({})
const { copy, copiedKey } = useSecretClipboard()

const seedFromQuery = (entry: VaultEntryDetail | null | undefined) => {
  if (!entry)
    return
  title.value = entry.entry.title
  folderId.value = entry.entry.folderId
  username.value = entry.payload.username ?? ''
  password.value = entry.payload.password ?? ''
  url.value = entry.payload.url ?? ''
  notes.value = entry.payload.notes ?? ''
  customFields.value = entry.payload.customFields.map(f => ({ ...f }))
}

watch(
  () => entryQuery.data.value,
  (v) => {
    if (v && typeof v === 'object' && 'entry' in v)
      seedFromQuery(v as VaultEntryDetail)
  },
  { immediate: true },
)

const folderOptions = computed(() => {
  const list = folders.data.value?.data ?? []
  const byId = new Map(list.map(f => [f.id, f]))
  const options: Array<{ label: string, value: string | null }> = [
    { label: t('vault.page.rootFolder'), value: null },
  ]
  for (const f of list)
    options.push({ label: folderPath(f.id, byId), value: f.id })
  return options
})

const addCustomField = () => {
  customFields.value.push({ name: '', isSecret: true, value: '' })
}
const removeCustomField = (idx: number) => {
  customFields.value.splice(idx, 1)
}

const addTagFromInput = () => {
  const t = newTag.value.trim()
  if (!t)
    return
  if (!tagNames.value.some(x => x.toLowerCase() === t.toLowerCase()))
    tagNames.value.push(t)
  newTag.value = ''
}
const removeTag = (name: string) => {
  tagNames.value = tagNames.value.filter(t => t !== name)
}

const buildPayload = (): PlainEntryPayload => ({
  username: username.value || null,
  password: password.value || null,
  url: url.value || null,
  notes: notes.value || null,
  customFields: customFields.value
    .filter((f: CustomField) => f.name.trim().length > 0)
    .map((f: CustomField) => ({ name: f.name.trim(), isSecret: f.isSecret, value: f.value })),
})

const error = ref<string | null>(null)

const onSubmit = async () => {
  error.value = null
  if (!title.value.trim()) {
    error.value = 'vault.entry.titleLabel'
    return
  }
  try {
    if (isNew.value) {
      const result = await create.mutateAsync({
        title: title.value.trim(),
        folderId: folderId.value,
        payload: buildPayload(),
        tagNames: tagNames.value,
      })
      emit('saved', result.entry.id)
      router.push(`/app/vault/entries/${result.entry.id}`)
    }
    else if (props.entryId) {
      const result = await update.mutateAsync({
        id: props.entryId,
        body: {
          title: title.value.trim(),
          folderId: folderId.value,
          payload: buildPayload(),
          tagNames: tagNames.value,
        },
      })
      emit('saved', result.entry.id)
    }
  }
  catch (err) {
    const code = (err as { data?: { statusMessage?: string }, statusMessage?: string }).data?.statusMessage
      ?? (err as { statusMessage?: string }).statusMessage
      ?? 'vault.entry.error_generic'
    error.value = code
  }
}

const onCancel = () => {
  emit('cancelled')
  if (isNew.value)
    router.push('/app/vault')
}

const toggleReveal = async (key: string) => {
  if (revealed[key]) {
    revealed[key] = false
    return
  }
  revealed[key] = true
  if (!isNew.value && props.entryId) {
    // Best-effort log — never fatal.
    api.logFieldReveal(props.entryId, { field: key }).catch(() => undefined)
  }
}

const onCopy = async (value: string, key: string) => {
  await copy(value, key)
}

const isLoading = computed(() =>
  (entryQuery.isLoading?.value ?? false) || create.isLoading.value || update.isLoading.value,
)
</script>

<template>
  <div class="p-6 space-y-5 max-w-3xl mx-auto">
    <h1 class="text-lg font-semibold text-highlighted">
      {{ isNew ? t('vault.entry.newEntryTitle') : t('vault.entry.editEntryTitle') }}
    </h1>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="t(`${error}`)"
    />

    <UFormField :label="t('vault.entry.titleLabel')" required>
      <UInput
        v-model="title"
        :placeholder="t('vault.entry.titlePlaceholder')"
        size="lg"
        autofocus
      />
    </UFormField>

    <div class="grid grid-cols-2 gap-3">
      <UFormField :label="t('vault.entry.folderLabel')">
        <USelect
          v-model="folderId"
          :items="folderOptions"
          value-key="value"
          option-attribute="label"
        />
      </UFormField>

      <UFormField :label="t('vault.entry.tagsLabel')">
        <div class="flex flex-wrap items-center gap-1 border border-default rounded-md p-2">
          <UBadge
            v-for="tag in tagNames"
            :key="tag"
            color="primary"
            variant="subtle"
            class="gap-1"
          >
            {{ tag }}
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              @click="removeTag(tag)"
            />
          </UBadge>
          <UInput
            v-model="newTag"
            :placeholder="t('vault.entry.tagsPlaceholder')"
            size="xs"
            variant="none"
            class="flex-1 min-w-32"
            @keydown.enter.prevent="addTagFromInput"
          />
        </div>
      </UFormField>
    </div>

    <UFormField :label="t('vault.entry.usernameLabel')">
      <div class="flex gap-1">
        <UInput v-model="username" class="flex-1" />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-copy"
          :aria-label="t('vault.entry.copy')"
          @click="onCopy(username, 'username')"
        />
        <UBadge v-if="copiedKey === 'username'" color="success" variant="soft" class="self-center">
          {{ t('vault.entry.copied') }}
        </UBadge>
      </div>
    </UFormField>

    <UFormField :label="t('vault.entry.passwordLabel')">
      <div class="flex gap-1">
        <UInput
          v-model="password"
          :type="revealed.password ? 'text' : 'password'"
          class="flex-1"
          autocomplete="new-password"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :icon="revealed.password ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :aria-label="revealed.password ? t('vault.entry.hide') : t('vault.entry.reveal')"
          @click="toggleReveal('password')"
        />
        <UPopover>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-wand-sparkles"
            :aria-label="t('vault.entry.passwordGenerator')"
          />
          <template #content>
            <VaultPasswordGenerator @generated="(v) => (password = v)" />
          </template>
        </UPopover>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-copy"
          :aria-label="t('vault.entry.copy')"
          @click="onCopy(password, 'password')"
        />
        <UBadge v-if="copiedKey === 'password'" color="success" variant="soft" class="self-center">
          {{ t('vault.entry.copied') }}
        </UBadge>
      </div>
    </UFormField>

    <UFormField :label="t('vault.entry.urlLabel')">
      <div class="flex gap-1">
        <UInput v-model="url" class="flex-1" />
        <UButton
          v-if="url"
          color="neutral"
          variant="ghost"
          icon="i-lucide-external-link"
          :aria-label="t('vault.entry.openUrl')"
          :href="url"
          target="_blank"
          rel="noopener"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-copy"
          :aria-label="t('vault.entry.copy')"
          @click="onCopy(url, 'url')"
        />
      </div>
    </UFormField>

    <UFormField :label="t('vault.entry.notesLabel')">
      <UTextarea
        v-model="notes"
        :rows="6"
        :type="revealed.notes ? 'text' : 'password'"
      />
      <template #help>
        <div class="flex gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="revealed.notes ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="revealed.notes ? t('vault.entry.hide') : t('vault.entry.reveal')"
            @click="toggleReveal('notes')"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-copy"
            :label="t('vault.entry.copy')"
            @click="onCopy(notes, 'notes')"
          />
        </div>
      </template>
    </UFormField>

    <div>
      <h3 class="text-sm font-semibold text-highlighted mb-2">
        {{ t('vault.entry.customFields') }}
      </h3>
      <div class="space-y-2">
        <div
          v-for="(field, idx) in customFields"
          :key="idx"
          class="grid grid-cols-12 gap-2 items-center"
        >
          <UInput
            v-model="field.name"
            :placeholder="t('vault.entry.customFieldName')"
            size="sm"
            class="col-span-3"
          />
          <UInput
            v-model="field.value"
            :placeholder="t('vault.entry.customFieldValue')"
            :type="field.isSecret && !revealed[`custom:${field.name}`] ? 'password' : 'text'"
            size="sm"
            class="col-span-6"
          />
          <UCheckbox
            v-model="field.isSecret"
            :label="t('vault.entry.customFieldSecret')"
            class="col-span-1"
          />
          <div class="col-span-2 flex justify-end gap-1">
            <UButton
              v-if="field.isSecret"
              color="neutral"
              variant="ghost"
              size="xs"
              :icon="revealed[`custom:${field.name}`] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              @click="toggleReveal(`custom:${field.name}`)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-copy"
              @click="onCopy(field.value, `custom:${field.name}`)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              @click="removeCustomField(idx)"
            />
          </div>
        </div>
      </div>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        :label="t('vault.entry.addCustomField')"
        class="mt-2"
        @click="addCustomField"
      />
    </div>

    <div class="flex justify-end gap-2 pt-4 border-t border-default">
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('vault.entry.cancel')"
        :disabled="isLoading"
        @click="onCancel"
      />
      <UButton
        color="primary"
        :label="t('vault.entry.save')"
        :loading="isLoading"
        @click="onSubmit"
      />
    </div>
  </div>
</template>
