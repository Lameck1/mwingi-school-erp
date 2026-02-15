
import { up as schemaUp } from './current/0001_initial_schema.js'
import { up as seedCoreUp } from './current/0010_seed_core_data.js'
import { up as seedAcademicUp } from './current/0020_seed_academic_data.js'
import { up as journalBridgeUp } from './incremental/1001_journal_entry_bridge.js'
import { up as financeSchemaFixesUp } from './incremental/1002_finance_schema_fixes.js'
import { up as budgetAllocationUp } from './incremental/1003_budget_allocation.js'
import { up as enrollmentUniqUp } from './incremental/1004_enrollment_active_uniqueness.js'
import { up as journalEntryTypeExpansionUp } from './incremental/1005_journal_entry_type_expansion.js'
import { up as paymentInvoiceAllocationUp } from './incremental/1006_payment_invoice_allocation.js'
import { up as paymentIdempotencyInvoiceUniqUp } from './incremental/1007_payment_idempotency_and_invoice_uniqueness.js'
import { up as attendanceAndReconciliationUniqUp } from './incremental/1008_attendance_and_reconciliation_uniqueness.js'
import { up as grantExpiryDateUp } from './incremental/1009_grant_expiry_date.js'
import { up as bankReconciliationConstraintsUp } from './incremental/1010_bank_reconciliation_constraints.js'
import { up as approvalCanonicalizationUp } from './incremental/1011_approval_canonicalization.js'
import { up as addVoidReversalTypeUp } from './incremental/1012_add_void_reversal_type.js'
import { up as financialPeriodStatusUp } from './incremental/1013_financial_period_status.js'
import { up as remediationSchemaFixesUp } from './incremental/1014_remediation_schema_fixes.js'

import type * as Database from 'better-sqlite3'

/**
 * Migration descriptor.
 *
 * Naming convention:
 *   current/0001_*  – Initial schema & seeds (run once on fresh install)
 *   incremental/1001_*  – Post-deployment changes (run on app updates)
 *
 * Every migration runs inside a SAVEPOINT so a single failing migration
 * does not leave the database in a half-applied state.
 */
interface Migration {
    /** Unique name — stored in `migrations` table once applied. */
    name: string
    /** Forward-only function that mutates the schema / data. */
    fn: (db: Database.Database) => void
}

// ── Registry ────────────────────────────────────────────────────
// Add new migrations here. Order matters: they run sequentially.
const migrations: Migration[] = [
    // Initial schema & seeds
    { name: '0001_initial_schema', fn: schemaUp },
    { name: '0010_seed_core_data', fn: seedCoreUp },
    { name: '0020_seed_academic_data', fn: seedAcademicUp },

    // ── Post-deployment incremental migrations ──────────────────
    // Add entries below as the app evolves after first release.
    { name: '1001_journal_entry_bridge', fn: journalBridgeUp },
    { name: '1002_finance_schema_fixes', fn: financeSchemaFixesUp },
    { name: '1003_budget_allocation', fn: budgetAllocationUp },
    { name: '1004_enrollment_active_uniqueness', fn: enrollmentUniqUp },
    { name: '1005_journal_entry_type_expansion', fn: journalEntryTypeExpansionUp },
    { name: '1006_payment_invoice_allocation', fn: paymentInvoiceAllocationUp },
    { name: '1007_payment_idempotency_and_invoice_uniqueness', fn: paymentIdempotencyInvoiceUniqUp },
    { name: '1008_attendance_and_reconciliation_uniqueness', fn: attendanceAndReconciliationUniqUp },
    { name: '1009_grant_expiry_date', fn: grantExpiryDateUp },
    { name: '1010_bank_reconciliation_constraints', fn: bankReconciliationConstraintsUp },
    { name: '1011_approval_canonicalization', fn: approvalCanonicalizationUp },
    { name: '1012_add_void_reversal_type', fn: addVoidReversalTypeUp },
    { name: '1013_financial_period_status', fn: financialPeriodStatusUp },
    { name: '1014_remediation_schema_fixes', fn: remediationSchemaFixesUp },
]

/**
 * Run all pending migrations in order.
 *
 * Each migration is wrapped in a SAVEPOINT so a failure rolls back
 * only that migration and the remaining ones are skipped.
 */
export function runMigrations(db: Database.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[]
    const appliedNames = new Set(applied.map(m => m.name))

    // Disable foreign-key enforcement for the entire migration run.
    // This MUST happen outside any transaction (PRAGMA is a no-op inside one).
    // Migrations that recreate tables (e.g. to alter CHECK constraints) need
    // this so DROP TABLE / INSERT-SELECT cycles aren't blocked by FK refs.
    db.exec('PRAGMA foreign_keys = OFF')

    try {
        for (const m of migrations) {
            if (appliedNames.has(m.name)) { continue }

            console.warn(`Running migration: ${m.name}`)
            const savepointName = `migration_${m.name.replaceAll(/\W/g, '_')}`

            try {
                db.exec(`SAVEPOINT ${savepointName}`)
                m.fn(db)
                db.prepare('INSERT INTO migrations (name) VALUES (?)').run(m.name)
                db.exec(`RELEASE SAVEPOINT ${savepointName}`)
                console.warn(`  ✓ Applied: ${m.name}`)
            } catch (err) {
                db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`)
                db.exec(`RELEASE SAVEPOINT ${savepointName}`)
                console.error(`  ✗ Migration failed: ${m.name}`, err)
                throw new Error(
                    `Migration "${m.name}" failed. Database rolled back to pre-migration state. ` +
                    `Cause: ${err instanceof Error ? err.message : String(err)}`
                )
            }
        }
    } finally {
        db.exec('PRAGMA foreign_keys = ON')
    }
}
