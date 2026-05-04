import process from 'node:process'
import dotenv from 'dotenv'

// parse --env argument
const envArg = process.argv.find(arg => arg.startsWith('--dotenv=')) || '--dotenv=.env'
const envFile = envArg.split('=')[1] || '.env'

// Try to load .env file, but don't fail if it doesn't exist in production
const envFound = dotenv.config({
  path: envFile,
})
if (envFound.error && process.env.NODE_ENV !== 'production') {
  throw new Error(`⚠️  Couldn't find ${envFile} file  ⚠️`)
}

process.env.NODE_ENV = process.env.NUXT_SITE_ENV || 'development'

const requiredEnvVars = [
  'NUXT_SITE_NAME',
  'NUXT_SITE_ENV',
  'NUXT_PUBLIC_SITE_URL',
  'NUXT_DATABASE_HOST',
  'NUXT_DATABASE_PORT',
  'NUXT_DATABASE_USER',
  'NUXT_DATABASE_PASSWORD',
  'NUXT_DATABASE_NAME',
  'NUXT_AUTH_SECRET',
]

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`⚠️  Missing required environment variable: ${key} ⚠️`)
  }
})

export const config = {
  site: {
    name: process.env.NUXT_SITE_NAME || '',
    env: process.env.NUXT_SITE_ENV || '',
    url: process.env.NUXT_PUBLIC_SITE_URL || '',
  },
  database: {
    host: process.env.NUXT_DATABASE_HOST || 'localhost',
    port: Number.parseInt(process.env.NUXT_DATABASE_PORT || '5432'),
    user: process.env.NUXT_DATABASE_USER || 'postgres',
    password: process.env.NUXT_DATABASE_PASSWORD || 'postgres',
    database: process.env.NUXT_DATABASE_NAME || 'mein_angelsport',
    pool_min: Number.parseInt(process.env.NUXT_DB_POOL_MIN || '2'),
    pool_max: Number.parseInt(process.env.NUXT_DB_POOL_MAX || '10'),
  },
  security: {
    auth_secret: process.env.NUXT_AUTH_SECRET || '',
  },
  email: {
    provider: (process.env.NUXT_EMAIL_PROVIDER || 'console') as 'console' | 'smtp',
    smtp: {
      host: process.env.NUXT_SMTP_HOST || '',
      port: Number.parseInt(process.env.NUXT_SMTP_PORT || '587'),
      user: process.env.NUXT_SMTP_USER || '',
      pass: process.env.NUXT_SMTP_PASS || '',
      from: process.env.NUXT_SMTP_FROM || 'noreply@example.com',
    },
  },
  storage: {
    provider: (process.env.NUXT_STORAGE_PROVIDER || 'local') as 'local' | 's3',
    local: {
      basePath: process.env.NUXT_STORAGE_LOCAL_PATH || './storage/uploads',
    },
    s3: {
      bucket: process.env.NUXT_S3_BUCKET || '',
      region: process.env.NUXT_S3_REGION || '',
      endpoint: process.env.NUXT_S3_ENDPOINT || '',
      accessKeyId: process.env.NUXT_S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.NUXT_S3_SECRET_ACCESS_KEY || '',
    },
    maxFileSize: Number.parseInt(process.env.NUXT_STORAGE_MAX_FILE_SIZE || String(5 * 1024 * 1024)), // 5MB
    allowedMimeTypes: (process.env.NUXT_STORAGE_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(','),
  },
  orchestrator: {
    historyLimit: Number.parseInt(process.env.NUXT_ORCHESTRATOR_HISTORY_LIMIT || '30'),
  },
  github: {
    syncIntervalMinutes: Number.parseInt(process.env.NUXT_GITHUB_SYNC_INTERVAL_MINUTES || '15'),
    commitsPerSync: Number.parseInt(process.env.NUXT_GITHUB_COMMITS_PER_SYNC || '50'),
  },
  i18n: {
    defaultLocale: process.env.NUXT_PUBLIC_I18N_DEFAULT_LOCALE || 'de',
  },
}

export default config
export type Config = typeof config
