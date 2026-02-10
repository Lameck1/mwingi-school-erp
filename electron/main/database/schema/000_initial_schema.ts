import { up as coreSchemaUp } from './fragments/010_core_schema.js'
import { up as academicUpdatesUp } from './fragments/020_academic_updates.js'
import { up as productionAlignmentUp } from './fragments/030_production_alignment.js'
import { up as archiveRestorationsUp } from './fragments/040_archive_restorations.js'

import type { Database } from 'better-sqlite3'

export const INITIAL_SCHEMA_NAME = '0001_initial_schema'

export function up(db: Database): void {
  coreSchemaUp(db)
  academicUpdatesUp(db)
  productionAlignmentUp(db)
  archiveRestorationsUp(db)
}
