import type { Buffer } from 'node:buffer'
import type { FileStoreGetResult, FileStoreMetadata, FileStoreProvider } from '../file-store-provider.interface'
import fs from 'node:fs/promises'
import path from 'node:path'

const extToMime = (ext: string): string => {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

interface LocalFileStoreConfig {
  basePath: string
}

export const createLocalFileStoreProvider = (config: LocalFileStoreConfig): FileStoreProvider => {
  const resolvePath = (key: string) => path.resolve(config.basePath, key)

  const ensureDirectory = async (filePath: string) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
  }

  const put = async (key: string, buffer: Buffer, _metadata: FileStoreMetadata): Promise<void> => {
    const filePath = resolvePath(key)
    await ensureDirectory(filePath)
    await fs.writeFile(filePath, buffer)
  }

  const get = async (key: string): Promise<FileStoreGetResult> => {
    const filePath = resolvePath(key)
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(key).toLowerCase()
    const mimeType = extToMime(ext)
    return { buffer, mimeType }
  }

  const del = async (key: string): Promise<void> => {
    const filePath = resolvePath(key)
    try {
      await fs.unlink(filePath)
    }
    catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        throw err
    }
  }

  const exists = async (key: string): Promise<boolean> => {
    const filePath = resolvePath(key)
    try {
      await fs.access(filePath)
      return true
    }
    catch {
      return false
    }
  }

  return { put, get, delete: del, exists }
}
