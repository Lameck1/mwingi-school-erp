import { up as seedAcademicUp } from '../../seeds/academic_seed.js'

import type { Database } from 'better-sqlite3'

export const MIGRATION_NAME = '0020_seed_academic_data'

export function up(db: Database): void {
  seedAcademicUp(db)
}
