import { defineConfig } from 'drizzle-kit'
import { buildDatabaseUri } from './server/database/helper'
import { config } from './server/utils/config'

export default defineConfig({
  schema: './server/database/schema/*',
  out: './server/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: buildDatabaseUri(config.database),
  },
})
