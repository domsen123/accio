<script setup lang="ts">
const props = defineProps<{
  variant?: 'default' | 'dense'
}>()

const variantStyles = {
  dense: { title: 'text-lg sm:text-xl', root: 'py-4' },
  default: {},
}

const ui = computed(() => variantStyles[props.variant ?? 'default'])
</script>

<template>
  <UPageHeader v-bind="$attrs" :ui="ui">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </UPageHeader>
</template>
