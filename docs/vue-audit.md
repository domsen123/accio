# Vue Audit — 2026-05-05

## Summary
- Files scanned: 1 (`app/pages/app/kb/index.vue`)
- Critical: 0 | Major: 3 | Minor: 6
- Estimated effort: S

Scope was limited to the single file specified. No critical reactivity, prop-mutation, `any`, or hardcoded-hex violations were found. Findings concentrate on DESIGN.md token compliance (font-mono for dates/numbers, status badge variants, input size default) plus a handful of TypeScript and template hygiene issues.

## Findings by file

### app/pages/app/kb/index.vue

- **major** — line 429: `formatRelative(entry.updatedAt)` rendered inside a plain `<span>`. DESIGN.md §Typography requires `font-mono` for **every** date, duration, identifier, count. Fix: add `font-mono` (e.g. `<span class="font-mono">…</span>`) — the surrounding meta row uses `text-xs`, so `font-mono` aligns with the "Number sm" token.

- **major** — lines 376–383: status badge always uses `variant="outline"`. DESIGN.md §Tags and chips specifies `subtle` for `inbox`, `draft`, `verified` and `outline` only for `archived`. Fix: drive the variant from `entry.status` the same way `statusBadgeColor` drives the color (e.g. `archived → outline`, others → `subtle`).

- **major** — lines 464–466: page number rendered inside `<span class="text-sm text-muted">` without `font-mono`. DESIGN.md treats page counters as numerics ("Number md" token). Fix: add `font-mono`, or render the number in a separate `<span class="font-mono">` and keep the surrounding label in Inter.

- **minor** — line 42: `value.split(',').filter(Boolean) as KbEntryStatus[]`. Vue rules require `satisfies` over type assertions where possible. Fix: validate against the known status union (e.g. `.filter((v): v is KbEntryStatus => statusValues.includes(v))`) or narrow via a typed lookup.

- **minor** — lines 115, 117: `authorType.value as KbEntryAuthorType` / `sourceType.value as KbEntrySourceType` — same assertion pattern as above. Fix: narrow with a guard or `satisfies` against an explicit union.

- **minor** — line 246: `<UInput … size="xl">`. DESIGN.md §Inputs sets the default size to `md` (40px). `xl` deviates from the system without an articulated reason. Fix: drop the `size` prop (or move to `lg` if the larger search affordance is intentional and document the exception in DESIGN.md first).

- **minor** — line 428: `<UIcon name="i-lucide-clock" class="size-3.5" />`. DESIGN.md §Iconography lists `size-4 / size-5 / size-6` as the icon scale. `size-3.5` is off-scale. Fix: use `size-4` (matches the surrounding `text-xs` row better than 14px) or `size-3` if a tighter cue is required.

- **minor** — line 213: `:description=" t('kb.list.subtitle')"` has a leading space inside the binding expression. Fix: remove the stray space.

- **minor** — lines 2–16: multi-paragraph JSDoc block at the top of `<script setup>`. CLAUDE.md and the project's documentation guidance favour no comments unless the *why* is non-obvious; the T-1.8 / T-1.9 / T-1.10 markers are roadmap state that belongs in a ticket, not in source. Fix: drop the comment block, or trim to a one-line reason for the pagination heuristic if anything is worth keeping.

## Recommended fix order

1. Apply DESIGN.md §Typography rules: add `font-mono` to the relative-time span (line 429) and the page-number span (line 465).
2. Make the status badge `variant` reflect `entry.status` per DESIGN.md §Tags and chips (subtle for inbox/draft/verified, outline for archived).
3. Replace the three `as Kb…` assertions with type guards (`satisfies` / narrowing) so the URL → typed-state boundary is validated rather than asserted.
4. Reconcile the search input size with DESIGN.md (drop `size="xl"` or document the deviation).
5. Use an on-scale icon size on the clock glyph (`size-3.5` → `size-4`).
6. Tidy the stray leading space in the `:description` binding and trim the top-of-file JSDoc block.
