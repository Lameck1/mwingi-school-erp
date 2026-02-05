import { getDatabase } from '../index'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface MigrationRecord {
  id: number
  migration_name: string
  executed_at: string
}

export class MigrationRunner {
  private db = getDatabase()
  private migrationsPath: string

  constructor(migrationsPath?: string) {
    this.migrationsPath = migrationsPath || path.join(__dirname, '../migrations')
    this.ensureMigrationsTable()
  }

  /**
   * Ensure migrations tracking table exists
   */
  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT NOT NULL UNIQUE,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  /**
   * Get list of executed migrations
   */
  private getExecutedMigrations(): string[] {
    const result = this.db.prepare(`
      SELECT migration_name FROM _migrations ORDER BY id ASC
    `).all() as MigrationRecord[]

    return result.map(r => r.migration_name)
  }

  /**
   * Get list of pending migrations from filesystem
   */
  private getPendingMigrations(): string[] {
    if (!fs.existsSync(this.migrationsPath)) {
      console.warn(`Migrations directory not found: ${this.migrationsPath}`)
      return []
    }

    const allMigrations = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort()

    const executedMigrations = this.getExecutedMigrations()

    return allMigrations.filter(migration => !executedMigrations.includes(migration))
  }

  /**
   * Execute a single migration file
   */
  private executeMigration(migrationFile: string): void {
    const migrationPath = path.join(this.migrationsPath, migrationFile)
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    console.warn(`Executing migration: ${migrationFile}`)

    // SQLite doesn't support multi-statement transactions directly
    // Split by semicolons and execute individually (excluding comments)
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => {
        // Remove comment lines and empty statements
        return stmt.length > 0 && 
               !stmt.startsWith('--') && 
               !stmt.startsWith('/*')
      })

    this.db.transaction(() => {
      for (const statement of statements) {
        if (statement.trim().length > 0) {
          try {
            this.db.exec(statement)
          } catch (error) {
            console.error(`Error executing statement in ${migrationFile}:`, statement.substring(0, 100))
            throw error
          }
        }
      }

      // Record migration as executed
      this.db.prepare(`
        INSERT INTO _migrations (migration_name) VALUES (?)
      `).run(migrationFile)
    })()

    console.warn(`✓ Migration completed: ${migrationFile}`)
  }

  /**
   * Run all pending migrations
   */
  public runPendingMigrations(): { success: boolean; message: string; executed: string[] } {
    try {
      const pendingMigrations = this.getPendingMigrations()

      if (pendingMigrations.length === 0) {
        return {
          success: true,
          message: 'No pending migrations',
          executed: []
        }
      }

      console.warn(`Found ${pendingMigrations.length} pending migration(s)`)

      const executed: string[] = []

      for (const migration of pendingMigrations) {
        try {
          this.executeMigration(migration)
          executed.push(migration)
        } catch (error) {
          return {
            success: false,
            message: `Migration failed: ${migration} - ${error instanceof Error ? error.message : 'Unknown error'}`,
            executed
          }
        }
      }

      return {
        success: true,
        message: `Successfully executed ${executed.length} migration(s)`,
        executed
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during migration',
        executed: []
      }
    }
  }

  /**
   * Get migration status
   */
  public getStatus(): {
    total_migrations: number
    executed_migrations: number
    pending_migrations: number
    last_migration: string | null
  } {
    const executed = this.getExecutedMigrations()
    const pending = this.getPendingMigrations()

    return {
      total_migrations: executed.length + pending.length,
      executed_migrations: executed.length,
      pending_migrations: pending.length,
      last_migration: executed.length > 0 ? executed[executed.length - 1] : null
    }
  }

  /**
   * Rollback last migration (DANGEROUS - use with caution)
   * Note: This doesn't actually reverse the migration, just removes the record
   * Manual rollback SQL would need to be created separately
   */
  public rollbackLastMigration(): { success: boolean; message: string; rolled_back: string | null } {
    try {
      const lastMigration = this.db.prepare(`
        SELECT migration_name FROM _migrations ORDER BY id DESC LIMIT 1
      `).get() as MigrationRecord | undefined

      if (!lastMigration) {
        return {
          success: false,
          message: 'No migrations to rollback',
          rolled_back: null
        }
      }

      this.db.prepare(`
        DELETE FROM _migrations WHERE migration_name = ?
      `).run(lastMigration.migration_name)

      return {
        success: true,
        message: `Rollback record removed for: ${lastMigration.migration_name}. Manual database rollback may be required.`,
        rolled_back: lastMigration.migration_name
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during rollback',
        rolled_back: null
      }
    }
  }

  /**
   * Force mark a migration as executed (use for manual fixes)
   */
  public markAsExecuted(migrationFile: string): { success: boolean; message: string } {
    try {
      const exists = this.db.prepare(`
        SELECT COUNT(*) as count FROM _migrations WHERE migration_name = ?
      `).get(migrationFile) as { count: number }

      if (exists.count > 0) {
        return {
          success: false,
          message: `Migration already marked as executed: ${migrationFile}`
        }
      }

      this.db.prepare(`
        INSERT INTO _migrations (migration_name) VALUES (?)
      `).run(migrationFile)

      return {
        success: true,
        message: `Migration marked as executed: ${migrationFile}`
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

// Export singleton instance
export const migrationRunner = new MigrationRunner()

