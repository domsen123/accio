<script setup lang="ts">
import type { MaybeRefOrGetter } from 'vue'
import { useAdminGlobalRoles, useAdminUserRoles, useAssignUserRole, useRemoveUserRole } from '../composables/useAdminUserRoles'

const props = defineProps<{
  userId: MaybeRefOrGetter<string>
}>()

const toast = useToast()

const { roles, status, error } = useAdminUserRoles(() => toValue(props.userId))
const { roles: globalRoles } = useAdminGlobalRoles()
const { mutateAsync: assignRole, asyncStatus: assignStatus } = useAssignUserRole()
const { mutateAsync: removeRole, asyncStatus: removeStatus } = useRemoveUserRole()

const isLoading = computed(() => status.value === 'pending')
const isAssigning = computed(() => assignStatus.value === 'loading')
const isRemoving = computed(() => removeStatus.value === 'loading')

const removingRoleId = ref<string | null>(null)

// Available roles = global roles minus already-assigned ones
const availableRoles = computed(() => {
  const assignedIds = new Set(roles.value.map(r => r.id))
  return globalRoles.value.filter(r => !assignedIds.has(r.id))
})

const selectedRoleId = ref<string | undefined>(undefined)

const handleAssignRole = async () => {
  if (!selectedRoleId.value)
    return

  try {
    await assignRole({ userId: toValue(props.userId), roleId: selectedRoleId.value })
    toast.add({ title: 'Role assigned successfully', color: 'success' })
    selectedRoleId.value = undefined
  }
  catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
      || (err as { message?: string })?.message
      || 'Failed to assign role'
    toast.add({ title: message, color: 'error' })
  }
}

const handleRemoveRole = async (roleId: string) => {
  removingRoleId.value = roleId
  try {
    await removeRole({ userId: toValue(props.userId), roleId })
    toast.add({ title: 'Role removed successfully', color: 'success' })
  }
  catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
      || (err as { message?: string })?.message
      || 'Failed to remove role'
    toast.add({ title: message, color: 'error' })
  }
  finally {
    removingRoleId.value = null
  }
}

// Human-readable permission names for global scope
const permissionNames: Record<string, string> = {
  'platform:admin': 'Platform Administrator',
  'organisation:create': 'Create Organisation',
}

const getPermissionName = (code: string): string => {
  return permissionNames[code] ?? code
}
</script>

<template>
  <UPageCard
    title="Global Roles & Permissions"
    description="Manage the user's global roles and associated permissions."
    variant="subtle"
  >
    <div class="space-y-4">
      <div v-if="isLoading" class="flex items-center gap-2 text-muted">
        <UIcon name="i-lucide-loader-2" class="animate-spin size-4" />
        <span>Loading roles...</span>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        title="Failed to load roles"
        :description="error.message"
        icon="i-lucide-alert-circle"
      />

      <template v-else>
        <!-- Assign role -->
        <div v-if="availableRoles.length > 0" class="flex items-end gap-2">
          <UFormField label="Add Role" class="flex-1">
            <USelectMenu
              v-model="selectedRoleId"
              :items="availableRoles.map(r => ({ label: r.name, value: r.id }))"
              value-key="value"
              placeholder="Select a role..."
            />
          </UFormField>
          <UButton
            :loading="isAssigning"
            :disabled="!selectedRoleId"
            icon="i-lucide-plus"
            @click="handleAssignRole"
          >
            Assign
          </UButton>
        </div>

        <!-- No roles -->
        <div v-if="roles.length === 0" class="text-muted">
          <p>No global roles assigned to this user.</p>
        </div>

        <!-- Role cards -->
        <div v-else class="space-y-3">
          <div
            v-for="role in roles"
            :key="role.id"
            class="bg-elevated rounded-lg p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-shield" class="size-5 text-primary" />
                <span class="font-medium">{{ role.name }}</span>
                <UBadge v-if="role.isSystem" color="neutral" variant="subtle" size="xs">
                  System
                </UBadge>
                <UBadge v-if="role.isDefault" color="primary" variant="subtle" size="xs">
                  Default
                </UBadge>
              </div>
              <UButton
                variant="ghost"
                color="error"
                size="xs"
                icon="i-lucide-trash-2"
                :loading="isRemoving && removingRoleId === role.id"
                :disabled="isRemoving && removingRoleId !== role.id"
                @click="handleRemoveRole(role.id)"
              >
                Remove
              </UButton>
            </div>

            <p v-if="role.description" class="text-sm text-muted mb-3">
              {{ role.description }}
            </p>

            <div v-if="role.permissions.length > 0" class="space-y-2">
              <p class="text-sm font-medium text-muted">
                Permissions:
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="perm in role.permissions"
                  :key="perm.permission"
                  color="primary"
                  variant="soft"
                  size="sm"
                >
                  {{ getPermissionName(perm.permission) }}
                </UBadge>
              </div>
            </div>

            <p v-else class="text-sm text-muted italic">
              No permissions assigned to this role.
            </p>
          </div>
        </div>
      </template>
    </div>
  </UPageCard>
</template>
