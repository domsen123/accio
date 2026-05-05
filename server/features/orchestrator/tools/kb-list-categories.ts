// MCP read tool: kb_list_categories.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3.
//
// Returns a tree of live categories scoped to the caller's workspace.
// Soft-deleted categories are excluded by default — same as `kbCategoryService.list`.

import type { KbCategoryService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'

export const kbListCategoriesInputSchema = z.object({})
export type KbListCategoriesInput = z.infer<typeof kbListCategoriesInputSchema>

export interface KbCategoryNode {
  id: string
  slug: string
  name: string
  parent_id: string | null
  children: KbCategoryNode[]
}

export interface KbListCategoriesOutput {
  categories: KbCategoryNode[]
}

export interface CreateKbListCategoriesToolDeps {
  kbCategoryService: KbCategoryService
}

/**
 * Build a parent→children tree from a flat list. Roots are rows whose
 * `parentId` is null OR whose parent isn't present in the workspace's live set
 * (defensive: a soft-deleted parent shouldn't strand its children at depth 0
 * forever, but until the parent is restored / hard-deleted, surfacing the
 * orphaned subtree at root level is the least-confusing behaviour).
 */
const buildTree = (
  rows: ReadonlyArray<{ id: string, slug: string, name: string, parentId: string | null }>,
): KbCategoryNode[] => {
  const byId = new Map<string, KbCategoryNode>()
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      parent_id: row.parentId,
      children: [],
    })
  }

  const roots: KbCategoryNode[] = []
  for (const row of rows) {
    const node = byId.get(row.id)!
    const parent = row.parentId ? byId.get(row.parentId) : undefined
    if (parent)
      parent.children.push(node)
    else
      roots.push(node)
  }
  return roots
}

export const createKbListCategoriesTool = (
  deps: CreateKbListCategoriesToolDeps,
): Tool<KbListCategoriesInput, KbListCategoriesOutput> => ({
  name: 'kb_list_categories',
  description: 'List all live KB categories in the workspace as a parent→children tree.',
  schema: kbListCategoriesInputSchema as unknown as z.ZodType<KbListCategoriesInput>,
  class: 'auto',
  mode: 'read',
  handler: async (_input, ctx) => {
    const rows = await deps.kbCategoryService.list({ organisationId: ctx.organisationId })
    return { categories: buildTree(rows) }
  },
})
