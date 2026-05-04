<script setup lang="ts">
const props = defineProps<{
  src: string
  focusX: number
  focusY: number
}>()

const emit = defineEmits<{
  update: [coords: { focusX: number, focusY: number }]
}>()

const imageRef = ref<HTMLElement | null>(null)

const onClick = (event: MouseEvent) => {
  const el = imageRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const focusX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const focusY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  emit('update', { focusX: Math.round(focusX * 100) / 100, focusY: Math.round(focusY * 100) / 100 })
}
</script>

<template>
  <div
    ref="imageRef"
    class="relative cursor-crosshair rounded-lg overflow-hidden select-none"
    @click="onClick"
  >
    <img
      :src="props.src"
      class="w-full block"
      draggable="false"
    >
    <div
      class="absolute size-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      :style="{ left: `${props.focusX * 100}%`, top: `${props.focusY * 100}%` }"
    >
      <div class="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
      <div class="absolute inset-1.5 rounded-full bg-primary" />
    </div>
  </div>
</template>
