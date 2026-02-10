import { up as seedCoreUp } from '../../seeds/core_seed.js'

import type { Database } from 'better-sqlite3'

export const MIGRATION_NAME = '0010_seed_core_data'

export function up(db: Database): void {
  seedCoreUp(db)
}
