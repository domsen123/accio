<script setup lang="ts">
const props = withDefaults(defineProps<{
  userId: string
  name: string | null
  email: string | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}>(), {
  size: 'md',
})

const userIdRef = computed(() => props.userId)
const { files } = useFilesByEntity('user-avatar', userIdRef, { includeVariants: true })

const SIZE_TO_VARIANT: Record<string, string> = {
  '3xs': 'sm',
  '2xs': 'sm',
  'xs': 'sm',
  'sm': 'sm',
  'md': 'md',
  'lg': 'md',
  'xl': 'md',
  '2xl': 'lg',
  '3xl': 'lg',
}

const avatarSrc = computed(() => {
  if (!files.value.length)
    return undefined

  const preferred = SIZE_TO_VARIANT[props.size] || 'md'

  // Try to find the preferred variant
  const variant = files.value.find(f => f.variant === preferred)
  if (variant)
    return variant.url

  // Fallback to original
  const original = files.value.find(f => f.variant === 'original')
  if (original)
    return original.url

  // Legacy fallback: prefer files without a parentId (originals), then any file
  const legacyOriginal = files.value.find(f => !f.parentId)
  return legacyOriginal?.url ?? files.value[0]!.url
})

const displayName = computed(() => props.name || props.email || undefined)
</script>

<template>
  <UAvatar
    :src="avatarSrc"
    :alt="displayName"
    :size="size"
  />
</template>
