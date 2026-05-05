# Vue 3 Best Practices

Apply to all `.vue` files in this project.

## Component structure

- Use `<script setup lang="ts">` — never Options API.
- Order: `<script setup>` → `<template>` → `<style scoped>`.
- One component per file. Filename in `PascalCase.vue`. Match the component name.
- Single-root templates — wrap multiples in a fragment or container.

## Reactivity

- Prefer `ref()` for primitives, `reactive()` only for grouped state.
- Don't destructure reactive objects — destructure breaks reactivity. Use `toRefs()` if you must.
- Use `computed()` for derived state. Never derive in the template with complex logic.
- Use `watch()` for side effects, `watchEffect()` only when dependencies are obvious.

## Props and events

- Define props with `defineProps<{...}>()` using TypeScript, with `withDefaults()` for defaults.
- Define emits with `defineEmits<{...}>()` — typed events only.
- Never mutate props. Emit an event or use `defineModel()` for two-way binding.
- Prefer `defineModel()` over `v-model` boilerplate (Vue 3.4+).

## Templates

- Use `v-if` for conditional rendering, `v-show` only for frequent toggles of expensive content.
- Never combine `v-if` and `v-for` on the same element. Filter in a `computed()` instead.
- Always provide `:key` on `v-for` — stable, unique, not the index unless the list is static.
- Prefer slots over many props for content composition.

## Composables

- Extract reusable logic into `useXxx()` composables under `app/composables/`.
- Composables return `ref`s and functions; consumers destructure freely.
- Composables that fetch data use Pinia Colada (`useQuery`, `useMutation`) per the starter's conventions.

## Async and lifecycle

- Use `async setup()` patterns via `<Suspense>` only when truly needed; otherwise fetch in composables.
- Cleanup in `onUnmounted()` — listeners, timers, subscriptions.
- Prefer `useAsyncData()` / `useFetch()` for SSR-safe fetches in Nuxt pages.

## Styling

- Tailwind utility classes in templates, not `<style>` blocks where possible.
- `<style scoped>` only for genuinely component-specific styles that can't be expressed via utilities.
- Never use `!important`. Never inline styles for theme values — use design tokens (see DESIGN.md).

## TypeScript

- Strict mode on. No `any`. Prefer `unknown` and narrow.
- Type props, emits, and exposed methods explicitly.
- Use `satisfies` over type assertions where possible.

## Don't

- Don't use `this`. There's no `this` in `<script setup>`.
- Don't reach into child components with `ref` unless absolutely necessary; prefer events.
- Don't put business logic in components — move it to composables or services.
- Don't use global event buses. Use props/emits, provide/inject, or Pinia.