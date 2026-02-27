import type Database from 'better-sqlite3'

/**
 * Migration 1025: Database Health Remediation.
 * 
 * 1. Prunes orphaned payment_invoice_allocation records that point to 
 *    non-existent ledger_transaction IDs (fixing FK violations).
 * 2. Seeds the missing SCHOLARSHIP_LIABILITY (2030) system account.
 */
export function up(db: Database.Database): void {
    console.warn('[migration-1025] Running database health remediation...')

    // 1. Prune orphaned payment allocations
    const orphanCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM payment_invoice_allocation 
        WHERE transaction_id NOT IN (SELECT id FROM ledger_transaction)
    `).get() as { count: number }

    if (orphanCount.count > 0) {
        console.warn(`[migration-1025] Pruning ${orphanCount.count} orphaned records from payment_invoice_allocation`)
        db.exec(`
            DELETE FROM payment_invoice_allocation 
            WHERE transaction_id NOT IN (SELECT id FROM ledger_transaction)
        `)
    }

    // 2. Seed missing SCHOLARSHIP_LIABILITY account
    const insertGL = db.prepare(`
        INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
        VALUES (?, ?, ?, ?, 1, 1)
    `)

    // SCHOLARSHIP_LIABILITY: 2030, LIABILITY, CREDIT
    insertGL.run('2030', 'Scholarship Liability', 'LIABILITY', 'CREDIT')
    
    console.warn('[migration-1025] ✓ Database health remediation complete')
}
