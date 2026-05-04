import { sql } from 'drizzle-orm'
import { afterEach } from 'vitest'

import { getDatabase } from '../server/infrastructure/database/client'

// Clean tables between tests
export const cleanDatabase = async () => {
  const db = getDatabase('app')
  await db.execute(sql`TRUNCATE TABLE team_members, organisation_members, teams, organisations, password_reset_tokens, sessions, users CASCADE`)
}

afterEach(async () => {
  await cleanDatabase()
})
