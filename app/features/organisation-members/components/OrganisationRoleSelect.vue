<script setup lang="ts">
import type { OrganisationRole } from '../types/organisation-members.types'

const props = defineProps<{
  roles: OrganisationRole[]
  disabled?: boolean
}>()

const modelValue = defineModel<string>({ required: true })

const roleOptions = computed(() =>
  props.roles.map(role => ({
    label: role.name,
    value: role.id,
  })),
)
</script>

<template>
  <USelect
    v-model="modelValue"
    :items="roleOptions"
    :disabled="disabled"
    color="neutral"
    class="w-32"
    :ui="{ base: 'capitalize' }"
  />
</template>
