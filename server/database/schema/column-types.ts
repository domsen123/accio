import type { Buffer } from 'node:buffer'
import { customType } from 'drizzle-orm/pg-core'

// Postgres `bytea` column with Buffer ergonomics. Drizzle has no first-class
// bytea type; the `postgres` driver returns Buffer on read and accepts
// Buffer/Uint8Array on write. Centralised here so vault tables (and any
// future binary-blob tables) share one definition.
export const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType: () => 'bytea',
})
