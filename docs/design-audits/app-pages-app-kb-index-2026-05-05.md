# Design Audit — app/pages/app/kb/index.vue — 2026-05-05

## Summary
- Files scanned: 1
- Critical: 0 | Major: 4 | Minor: 6
- Estimated effort: S (<1h)
- Headline issues:
  1. Filter bar and category sidebar are hand-rolled `<div>` panels — should be `<UCard>` per DESIGN.md §9.
  2. Numeric renderings (page counter, relative time) lack `font-semibold` required by DESIGN.md §6 (`font-mono font-semibold tabular-nums`).
  3. List-item `<UCard>` overrides `root: 'bg-elevated...'` — redundant with default `variant="subtle"`; fights the configured card token.

## Findings by file

### app/pages/app/kb/index.vue

- **major** — line 218: sidebar category panel is a hand-rolled `<div class="rounded-xs border border-default bg-elevated p-4">`. DESIGN.md §9 mandates `<UCard>` for panels. Fix: replace with `<UCard>` (default `variant="subtle"` already yields elevated bg + ring).
- **major** — line 229: filter bar uses the same hand-rolled panel pattern. Fix: wrap in `<UCard>` and move `space-y-3` into card body slot.
- **major** — line 416: relative-time span uses `font-mono tabular-nums` but omits `font-semibold`. DESIGN.md §6 typography rule for numbers is `font-mono font-semibold tabular-nums`. Fix: add `font-semibold`.
- **major** — line 447: pagination page counter `<span class="text-sm text-muted font-mono tabular-nums">` missing `font-semibold`. Same rule. Fix: add `font-semibold`.
- **minor** — lines 351–355: list-item `<UCard :ui="{ root: 'bg-elevated transition-colors hover:bg-accented', body: 'p-4' }">` overrides root background and padding. `variant="subtle"` already paints `bg-elevated` and applies `p-4`. Drop the `bg-elevated` and `p-4` overrides; keep only the hover transition (or use a dedicated hoverable variant if added later).
- **minor** — line 142: archived status uses `variant: 'outline'` while DESIGN.md §9 only documents `variant="soft"` for badges (DESIGN.md: "Use `variant='soft'` badges for percentage changes; they are the most readable at small sizes"). The user-supplied audit checklist allows `outline` for archived, so this is a DESIGN.md gap rather than a clear violation — see §gaps.
- **minor** — line 361: entry title uses `text-base font-semibold`. DESIGN.md §6 body default is `text-sm`; explicit display size is undocumented. Acceptable for list-item heading but consider dropping to `text-sm` for density-first per design philosophy (§1: data density).
- **minor** — line 329: `<USkeleton class="h-20 w-full" />` uses fixed `h-20`. Tailwind token, acceptable, but row card visual height won't track if card padding changes. Consider deriving from card spacing.
- **minor** — line 412: `max-w-32` on author name — arbitrary single use, fine but consider a shared `truncate` width token if pattern repeats.
- **minor** — lines 218, 229: explicit `rounded-xs` on hand-rolled panels duplicates the configured `--ui-radius: 0.125rem`. DESIGN.md §12 Don'ts: "Don't add extra `rounded-*` classes on top." Once panels become `<UCard>` (see major above), this disappears automatically.

## Recommended fix order

1. Add `font-semibold` to numeric spans (line 416, 447) — one-line edits.
2. Drop redundant overrides on list-item `<UCard>` — let `variant="subtle"` handle bg/padding.
3. Replace hand-rolled sidebar + filter-bar `<div>` panels with `<UCard>`.
4. Resolve archived-badge variant policy (see gaps) and align.

## DESIGN.md gaps surfaced

- DESIGN.md §9 specifies only `variant="soft"` for badges. The user-supplied audit checklist documents an `archived → color="neutral" variant="outline"` mapping. Pick one and document in DESIGN.md §9 Tags/Badges.
- No status-badge color mapping exists in DESIGN.md (`inbox`/`draft`/`verified`/`archived`). Current code maps inbox→info, draft→warning, verified→success, archived→neutral. Document this mapping in DESIGN.md.
- No guidance on hover treatment for clickable list-item cards (`hover:bg-accented` here). Add a list-row pattern to DESIGN.md §11.
- No documented heading scale beyond "Heading: text-highlighted font-semibold". Empty-state `text-xl` and list-item `text-base` are ad-hoc — define a small heading scale.
- No spacing rule for skeleton placeholder heights tied to row density.
