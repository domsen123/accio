---
description: Audit Vue components against the project's Vue best practices and DESIGN.md
argument-hint: "[optional: path or feature folder, e.g. app/features/kb]"
---

Audit the Vue code in this project against the rules defined in `.claude/rules/vue.md` and the design tokens defined in `DESIGN.md`.

**Scope:** $ARGUMENTS (if empty, audit all `.vue` files under `app/`)

**Do not change any code.** Produce a report only.

## Steps

1. Read `.claude/rules/vue.md` and `DESIGN.md` to load the rules.
2. List the `.vue` files in scope.
3. For each file, check against:
   - Vue best practices (script setup, reactivity, props/emits, templates, composables, lifecycle, TypeScript)
   - Design system compliance (semantic utilities only, no hardcoded hex, no `dark:` prefixes, font-mono for numbers, correct radius scale)
4. Categorise findings per file:
   - **critical** — breaks Vue reactivity, mutates props, uses `any`, hardcodes hex values
   - **major** — Options API usage, `v-if` + `v-for` combined, missing keys, inline styles for theme values
   - **minor** — style block where utilities would do, missing TypeScript types on emits, inconsistent spacing

## Output

Write the report to `docs/vue-audit.md` with this structure:

```
# Vue Audit — <date>

## Summary
- Files scanned: N
- Critical: N | Major: N | Minor: N
- Estimated effort: S/M/L

## Findings by file

### app/path/to/Component.vue
- **critical** — line 42: mutates prop `items` directly. Fix: emit an event.
- **major** — line 17: uses Options API. Fix: convert to `<script setup>`.
- ...

## Recommended fix order
1. ...
2. ...
```

After writing the report, **stop**. Do not propose fixes inline; wait for me to review and request specific fixes.