import { up as schemaUp } from '../../schema/000_initial_schema.js'

import type { Database } from 'better-sqlite3'

export const MIGRATION_NAME = '0001_initial_schema'

export function up(db: Database): void {
  schemaUp(db)
}
