import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import config from '~~/server/utils/config'

const ALGORITHM = 'aes-256-gcm'

const deriveKey = (): Buffer => {
  return createHash('sha256').update(config.security.auth_secret).digest()
}

export const encryptApiKey = (plaintext: string): { encrypted: string, iv: string, tag: string } => {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

export const decryptApiKey = (encrypted: string, iv: string, tag: string): string => {
  const key = deriveKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
