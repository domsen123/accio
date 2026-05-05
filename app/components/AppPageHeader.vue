<script setup lang="ts">
const props = defineProps<{
  variant?: 'default' | 'dense'
}>()

const rootBase = 'border-b border-default mb-6'

const variantStyles = {
  dense: { title: 'text-lg sm:text-xl', root: `${rootBase} py-4` },
  default: { root: `${rootBase} pb-4` },
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
