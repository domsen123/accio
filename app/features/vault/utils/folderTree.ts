import type { VaultFolder } from '../types/vault.types'

/**
 * Folder tree shape used by the side panel (T-V-24, T-V-25).
 * Children are sorted alphabetically; soft-deleted folders are excluded
 * upstream by the API.
 */
export interface VaultFolderNode {
  folder: VaultFolder
  depth: number
  children: VaultFolderNode[]
}

export const buildFolderTree = (folders: VaultFolder[]): VaultFolderNode[] => {
  const byParent = new Map<string | null, VaultFolder[]>()
  for (const f of folders) {
    const arr = byParent.get(f.parentId) ?? []
    arr.push(f)
    byParent.set(f.parentId, arr)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name))
  }

  const visit = (parentId: string | null, depth: number): VaultFolderNode[] =>
    (byParent.get(parentId) ?? []).map(f => ({
      folder: f,
      depth,
      children: visit(f.id, depth + 1),
    }))

  return visit(null, 0)
}

export const folderPath = (
  folderId: string | null,
  byId: Map<string, VaultFolder>,
): string => {
  if (folderId === null)
    return ''
  const parts: string[] = []
  let cursor: string | null = folderId
  const guard = new Set<string>()
  while (cursor !== null) {
    if (guard.has(cursor))
      break
    guard.add(cursor)
    const f = byId.get(cursor)
    if (!f)
      break
    parts.unshift(f.name)
    cursor = f.parentId
  }
  return parts.join(' / ')
}
