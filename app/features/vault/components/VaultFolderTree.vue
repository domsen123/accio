<script setup lang="ts">
/**
 * Vault folder tree (T-V-25, REQ-VAULT-9).
 *
 * Recursive nested rendering up to MAX depth (5). Emits selection
 * events; new-folder, rename, and delete actions live on each row's
 * action menu and call the mutation composables. Drag-to-reparent is
 * out of scope for this iteration — left as a follow-up note.
 */
import type { VaultFolderNode } from '../utils/folderTree'
import {
  useCreateVaultFolder,
  useDeleteVaultFolder,
  useUpdateVaultFolder,
  useVaultFolders,
} from '../composables/useVaultEntries'
import { buildFolderTree } from '../utils/folderTree'

const props = defineProps<{
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [folderId: string | null]
}>()

const { t } = useI18n()
const folders = useVaultFolders()
const createFolder = useCreateVaultFolder()
const updateFolder = useUpdateVaultFolder()
const deleteFolder = useDeleteVaultFolder()

const tree = computed<VaultFolderNode[]>(() =>
  buildFolderTree(folders.data.value?.data ?? []),
)

const expanded = ref<Set<string>>(new Set())
const toggle = (id: string) => {
  if (expanded.value.has(id))
    expanded.value.delete(id)
  else
    expanded.value.add(id)
}

const renamingId = ref<string | null>(null)
const renameValue = ref('')
const beginRename = (id: string, name: string) => {
  renamingId.value = id
  renameValue.value = name
}
const cancelRename = () => {
  renamingId.value = null
  renameValue.value = ''
}
const commitRename = async () => {
  const id = renamingId.value
  if (!id)
    return
  const name = renameValue.value.trim()
  if (!name) {
    cancelRename()
    return
  }
  await updateFolder.mutateAsync({ id, body: { name } })
  renamingId.value = null
  renameValue.value = ''
}

const newFolderParent = ref<string | null | undefined>(undefined)
const newFolderName = ref('')
const beginCreate = (parentId: string | null) => {
  newFolderParent.value = parentId
  newFolderName.value = ''
}
const commitCreate = async () => {
  const name = newFolderName.value.trim()
  if (!name) {
    newFolderParent.value = undefined
    return
  }
  await createFolder.mutateAsync({ name, parentId: newFolderParent.value ?? null })
  newFolderParent.value = undefined
  newFolderName.value = ''
}
const cancelCreate = () => {
  newFolderParent.value = undefined
  newFolderName.value = ''
}

const deleteOpen = ref<string | null>(null)
const deleteStrategy = ref<'move_to_parent' | 'delete_recursive'>('move_to_parent')
const beginDelete = (id: string) => {
  deleteOpen.value = id
  deleteStrategy.value = 'move_to_parent'
}
const commitDelete = async () => {
  const id = deleteOpen.value
  if (!id)
    return
  await deleteFolder.mutateAsync({ id, strategy: deleteStrategy.value })
  deleteOpen.value = null
  if (props.selectedId === id)
    emit('select', null)
}

const isSelected = (id: string | null) => props.selectedId === id
</script>

<template>
  <div class="space-y-1 text-sm">
    <button
      type="button"
      class="w-full flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted"
      :class="{ 'bg-muted font-medium': isSelected(null) }"
      @click="emit('select', null)"
    >
      <UIcon name="i-lucide-folder-open" class="size-4 text-muted" />
      {{ t('vault.page.rootFolder') }}
    </button>

    <div class="space-y-0.5">
      <template v-for="node in tree" :key="node.folder.id">
        <VaultFolderTreeNode
          :node="node"
          :selected-id="props.selectedId"
          :expanded="expanded"
          :renaming-id="renamingId"
          :rename-value="renameValue"
          :new-folder-parent="newFolderParent"
          :new-folder-name="newFolderName"
          :delete-open="deleteOpen"
          :delete-strategy="deleteStrategy"
          @select="(id) => emit('select', id)"
          @toggle="toggle"
          @begin-rename="beginRename"
          @commit-rename="commitRename"
          @cancel-rename="cancelRename"
          @update:rename-value="(v: string) => (renameValue = v)"
          @begin-create="beginCreate"
          @commit-create="commitCreate"
          @cancel-create="cancelCreate"
          @update:new-folder-name="(v: string) => (newFolderName = v)"
          @begin-delete="beginDelete"
          @commit-delete="commitDelete"
          @update:delete-strategy="(v: 'move_to_parent' | 'delete_recursive') => (deleteStrategy = v)"
          @cancel-delete="() => (deleteOpen = null)"
        />
      </template>
    </div>

    <UButton
      v-if="newFolderParent === undefined"
      color="neutral"
      variant="ghost"
      size="xs"
      block
      icon="i-lucide-folder-plus"
      :label="t('vault.folders.newFolder')"
      @click="beginCreate(null)"
    />
    <div v-else-if="newFolderParent === null" class="flex items-center gap-1">
      <UInput
        v-model="newFolderName"
        size="xs"
        :placeholder="t('vault.folders.newFolderName')"
        class="flex-1"
        autofocus
        @keydown.enter.prevent="commitCreate"
        @keydown.esc="cancelCreate"
      />
      <UButton
        size="xs"
        icon="i-lucide-check"
        color="primary"
        variant="solid"
        :loading="createFolder.isLoading.value"
        @click="commitCreate"
      />
      <UButton
        size="xs"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        @click="cancelCreate"
      />
    </div>
  </div>
</template>
