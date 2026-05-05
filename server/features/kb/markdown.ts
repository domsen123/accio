// Wikilink parsing for KB entry bodies (DESIGN-WIKILINKS, REQ-KB-4).
//
// The implementation lives in `shared/kb/markdown.ts` so the client-side
// preview renderer (T-1.9) can reuse the same parser without duplicating the
// regex. This file re-exports the public surface for callers that already
// import from `~~/server/features/kb/markdown`.
export { parseWikilinks, wikilinkLabel } from '../../../shared/kb/markdown'
export type { WikilinkRef } from '../../../shared/kb/markdown'
