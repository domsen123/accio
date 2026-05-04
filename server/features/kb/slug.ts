// Slug generation for KB entries.
//
// INTERIM IMPLEMENTATION (T-1.2). The full slugify rules — umlaut folding and
// per-workspace collision suffixing — land in T-1.3. For now we keep the
// transform minimal so the service layer is usable and the unique-violation
// branch can be exercised by tests.
//
// TODO(T-1.3): handle umlauts (ä → ae, ö → oe, ü → ue, ß → ss), other
// diacritics, and append a collision suffix (`-2`, `-3`, ...) when the base
// slug already exists in the same workspace.
export const slugify = (title: string): string => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}
