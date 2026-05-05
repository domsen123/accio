# Design Migration — Prompt for Claude Code

Suggested workflow for adapting the existing app to DESIGN.md. Do this in order; don't skip steps.

---

## Step 1 — Install foundation files

Place these files in your repo:

- `DESIGN.md` → project root
- `app/assets/css/main.css` → replaces (or merges with) the existing one. Back up first if it has custom rules.
- `app/app.config.ts` → if a file already exists, merge the `ui.colors` block in.

Then add fonts to `nuxt.config.ts` if not already configured:

```ts
fonts: {
  families: [
    { name: 'Inter', provider: 'google' },
    { name: 'JetBrains Mono', provider: 'google' },
  ],
}
```

Run `pnpm dev`. Confirm:
- The app boots without errors.
- Inter is loaded as the body font.
- JetBrains Mono is available for `font-mono` utility.
- Yellow primary buttons appear yellow with dark text.
- Dark mode is active by default in the app shell.

---

## Step 2 — Audit the existing UI

Prompt for Claude Code:

```
Read DESIGN.md carefully. Then audit the existing frontend code under
app/ against it. Don't change anything yet.

Produce a report at docs/design-audit.md with:
- A section per page or significant component listing concrete deviations
- Categorised by severity:
  * critical (breaks principles — hardcoded hex, custom shadows, non-semantic colors)
  * major (inconsistent with tokens — wrong radius, wrong typography size)
  * minor (polish — spacing nudges, icon size mismatches)
- Priority order suggestion for fixing
- Estimated effort per category (S = <1h, M = 1-3h, L = >3h)

Group recommendations by file path so I can address them feature-by-feature.

Then stop and wait for me to review.
```

Review the audit. Resolve any genuine ambiguity (DESIGN.md gaps) by updating DESIGN.md, not by exception in the audit.

---

## Step 3 — Update primitives first

Before touching feature-specific pages, fix the shared primitives:

```
Based on DESIGN.md and docs/design-audit.md, update the following in
this order. After EACH item, stop for visual review before moving on.

1. The app layout (app/layouts/app.vue or equivalent) — top nav, side
   nav, main content shell. Apply the App Shell pattern from §Layout
   patterns.

2. Any custom Button / Input / Card wrappers (if any exist) — replace
   with direct Nuxt UI components per §Components, removing custom
   styling that fights the design system.

3. The page-header pattern — extract into a reusable component
   (app/components/PageHeader.vue) following §Layout patterns
   §Page-header pattern.

4. Common list and card patterns — extract into composable components
   if reused across more than two features.

After each step, run `pnpm dev` and confirm the app still works.
Don't commit yet — wait for my visual review.
```

---

## Step 4 — Migrate pages feature by feature

Work through one feature at a time. Suggested order:

1. **KB** — pages under `app/pages/app/kb/**`
2. **Todos** — pages under `app/pages/app/todos/**`
3. **Projects** — pages under `app/pages/app/projects/**`
4. **Orchestrator** — pages under `app/pages/app/orchestrator/**`
5. **Vault** — pages under `app/pages/app/vault/**` (if already implemented)
6. **Settings** — pages under `app/pages/app/settings/**` (force light mode at layout level)

For each feature, prompt:

```
Migrate the {FEATURE} pages to match DESIGN.md, using docs/design-audit.md
as a checklist for that feature.

Constraints:
- Use Nuxt UI components and props; do not hand-roll styling
- Use semantic Tailwind utilities (bg-default, text-muted, etc.) — never
  hardcoded shades or hex
- Numbers, dates, IDs, code: font-mono
- Tags and status indicators per §Components §Tags and chips
- Page header per §Layout patterns
- No drop shadows; use bg-elevated for card depth
- For Settings: wrap the layout in <div class="light"> so the whole
  feature renders in light mode

After completing the feature, run `pnpm test:run`, `pnpm typecheck`,
`pnpm lint`. Stop for visual review before the next feature.
```

---

## Step 5 — Update CLAUDE.md

After migration, add to the project's `CLAUDE.md`:

```markdown
## Design system

All UI work follows DESIGN.md (project root). Before creating any new
component or page:
1. Check the relevant section of DESIGN.md
2. Use existing tokens; don't introduce new colors, font sizes, or
   spacing values without updating DESIGN.md first
3. Use Nuxt UI components and props; don't hand-roll styling
4. Run the implementation checklist at the end of DESIGN.md before
   marking a UI task complete
```

This locks in the design system for all future work.

---

## Common pitfalls during migration

- **`dark:` prefix everywhere.** If the audit shows lots of `dark:bg-zinc-800` style classes, the migration is to remove them and use `bg-elevated` (which auto-resolves). Don't half-migrate — leaving some `dark:` classes mixed with semantic utilities creates visual inconsistency.
- **Custom button styles.** Any `<button class="bg-yellow-400 …">` should become `<UButton color="primary">`. Trust the props.
- **Hardcoded shadows.** `shadow-md`, `shadow-lg` should be removed; use `bg-elevated` instead.
- **Inline radii.** `rounded-[10px]`, `rounded-[14px]` should snap to the standard scale.
- **Mixing Inter and Mono.** If a number is rendered in Inter, fix it. The numbers-in-mono rule is consistent across the app — `<span class="font-mono">{count}</span>`.
- **Light mode pockets.** Modals and settings pages need `<div class="light">` wrappers; don't try to override individual colors with `dark:white` etc.
