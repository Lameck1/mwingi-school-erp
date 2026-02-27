
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

type MatchStatus = 'UNMATCHED' | 'MATCHED' | 'RECONCILED' | 'DISPUTED' | 'IGNORED'
type MatchMethod = 'AUTO_PHONE' | 'AUTO_ADMISSION' | 'MANUAL'

interface MpesaImportRow {
    readonly mpesa_receipt_number: string
    readonly transaction_date: string
    readonly phone_number: string
    readonly amount: number
    readonly account_reference?: string
    readonly payer_name?: string
}

interface MpesaTransaction {
    readonly id: number
    readonly mpesa_receipt_number: string
    readonly transaction_date: string
    readonly phone_number: string
    readonly amount: number
    readonly account_reference: string | null
    readonly payer_name: string | null
    readonly status: MatchStatus
    readonly matched_student_id: number | null
    readonly match_method: MatchMethod | null
    readonly match_confidence: number | null
}

interface ImportResult {
    readonly success: boolean
    readonly batch_id?: number
    readonly total_imported: number
    readonly total_matched: number
    readonly total_unmatched: number
    readonly total_amount: number
    readonly duplicates_skipped: number
    readonly error?: string
}

interface MatchCandidate {
    readonly student_id: number
    readonly student_name: string
    readonly admission_number: string
    readonly method: MatchMethod
    readonly confidence: number
}

// ============================================================================
// SERVICE
// ============================================================================

class MpesaReconciliationService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS mpesa_phone_alias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_normalized TEXT NOT NULL UNIQUE,
            student_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES student(id)
          );
          CREATE INDEX IF NOT EXISTS idx_mpesa_phone_alias_phone ON mpesa_phone_alias(phone_normalized);
        `)
    }

    /**
     * Import a batch of M-Pesa transactions (from CSV or API).
     * Skips duplicates by mpesa_receipt_number. Auto-matches when possible.
     */
    importTransactions(rows: ReadonlyArray<MpesaImportRow>, userId: number, source: 'CSV' | 'API' | 'MANUAL' = 'CSV', fileName?: string): ImportResult {
        if (rows.length === 0) {
            return { success: false, total_imported: 0, total_matched: 0, total_unmatched: 0, total_amount: 0, duplicates_skipped: 0, error: 'No transactions to import' }
        }

        return this.db.transaction(() => {
            let totalImported = 0
            let totalMatched = 0
            let duplicatesSkipped = 0
            let totalAmount = 0

            const insertStmt = this.db.prepare(`
        INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, account_reference, payer_name, imported_by_user_id, status, matched_student_id, match_method, match_confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

            const duplicateCheck = this.db.prepare(
                'SELECT id FROM mpesa_transaction WHERE mpesa_receipt_number = ?'
            )

            for (const row of rows) {
                // Skip duplicates
                const existing = duplicateCheck.get(row.mpesa_receipt_number)
                if (existing) {
                    duplicatesSkipped++
                    continue
                }

                // Attempt auto-match
                const match = this.autoMatch(row)

                insertStmt.run(
                    row.mpesa_receipt_number,
                    row.transaction_date,
                    row.phone_number,
                    row.amount,
                    row.account_reference ?? null,
                    row.payer_name ?? null,
                    userId,
                    match ? 'MATCHED' : 'UNMATCHED',
                    match?.student_id ?? null,
                    match?.method ?? null,
                    match?.confidence ?? null
                )

                totalImported++
                totalAmount += row.amount
                if (match) { totalMatched++ }
            }

            const totalUnmatched = totalImported - totalMatched

            // Record batch
            const batchResult = this.db.prepare(`
        INSERT INTO mpesa_reconciliation_batch (total_imported, total_matched, total_unmatched, total_amount, source, file_name, imported_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(totalImported, totalMatched, totalUnmatched, totalAmount, source, fileName ?? null, userId)

            logAudit(userId, 'CREATE', 'mpesa_reconciliation_batch', batchResult.lastInsertRowid as number, null, {
                total_imported: totalImported, total_matched: totalMatched, duplicates_skipped: duplicatesSkipped
            })

            return {
                success: true,
                batch_id: batchResult.lastInsertRowid as number,
                total_imported: totalImported,
                total_matched: totalMatched,
                total_unmatched: totalUnmatched,
                total_amount: totalAmount,
                duplicates_skipped: duplicatesSkipped
            }
        })()
    }

    /**
     * Manually match an unmatched M-Pesa transaction to a student.
     */
    manualMatch(transactionId: number, studentId: number, userId: number): { success: boolean; error?: string } {
        const txn = this.db.prepare('SELECT status, phone_number FROM mpesa_transaction WHERE id = ?').get(transactionId) as { status: MatchStatus; phone_number: string } | undefined
        if (!txn) { return { success: false, error: 'Transaction not found' } }
        if (txn.status !== 'UNMATCHED') {
            return { success: false, error: `Transaction is already ${txn.status.toLowerCase()}` }
        }

        this.db.prepare(`
      UPDATE mpesa_transaction
      SET status = 'MATCHED', matched_student_id = ?, match_method = 'MANUAL', match_confidence = 1.0
      WHERE id = ?
    `).run(studentId, transactionId)

        // Persist alias for future auto-matching
        const normalizedPhone = txn.phone_number.replace(/^\+254/, '0').replace(/^254/, '0')
        try {
            this.db.prepare(`
              INSERT OR IGNORE INTO mpesa_phone_alias (phone_normalized, student_id)
              VALUES (?, ?)
            `).run(normalizedPhone, studentId)
        } catch { /* noop */ }

        logAudit(userId, 'UPDATE', 'mpesa_transaction', transactionId,
            { status: 'UNMATCHED' }, { status: 'MATCHED', matched_student_id: studentId }
        )
        return { success: true }
    }

    /**
     * Get unmatched transactions for manual reconciliation.
     */
    getUnmatchedTransactions(): MpesaTransaction[] {
        return this.db.prepare(
            "SELECT * FROM mpesa_transaction WHERE status = 'UNMATCHED' ORDER BY transaction_date DESC"
        ).all() as MpesaTransaction[]
    }

    /**
     * Get all transactions for a specific status.
     */
    getTransactionsByStatus(status: MatchStatus): MpesaTransaction[] {
        return this.db.prepare(
            'SELECT * FROM mpesa_transaction WHERE status = ? ORDER BY transaction_date DESC'
        ).all(status) as MpesaTransaction[]
    }

    /**
     * Get reconciliation summary statistics.
     */
    getReconciliationSummary(): {
        total_transactions: number
        total_matched: number
        total_unmatched: number
        total_reconciled: number
        total_amount: number
        unmatched_amount: number
    } {
        const result = this.db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status IN ('MATCHED', 'RECONCILED') THEN 1 ELSE 0 END) as total_matched,
        SUM(CASE WHEN status = 'UNMATCHED' THEN 1 ELSE 0 END) as total_unmatched,
        SUM(CASE WHEN status = 'RECONCILED' THEN 1 ELSE 0 END) as total_reconciled,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'UNMATCHED' THEN amount ELSE 0 END), 0) as unmatched_amount
      FROM mpesa_transaction
    `).get() as {
            total_transactions: number; total_matched: number; total_unmatched: number
            total_reconciled: number; total_amount: number; unmatched_amount: number
        }

        return result
    }

    // ── AUTO-MATCHING ──────────────────────────────────────────────────

    private autoMatch(row: MpesaImportRow): MatchCandidate | null {
        // Strategy 1: Match by guardian phone number
        const phoneMatch = this.matchByPhone(row.phone_number)
        if (phoneMatch) { return phoneMatch }

        // Strategy 2: Match by admission number in account_reference
        if (row.account_reference) {
            const admissionMatch = this.matchByAdmissionNumber(row.account_reference)
            if (admissionMatch) { return admissionMatch }
        }

        return null
    }

    private matchByPhone(phone: string): MatchCandidate | null {
        // Normalize phone: remove leading 0 or +254 prefix
        const normalizedPhone = phone.replace(/^\+254/, '0').replace(/^254/, '0')

        // Check learned aliases first
        const alias = this.db.prepare(`
          SELECT a.student_id, s.first_name || ' ' || s.last_name as student_name, s.admission_number
          FROM mpesa_phone_alias a
          JOIN student s ON s.id = a.student_id
          WHERE a.phone_normalized = ?
          LIMIT 1
        `).get(normalizedPhone) as { student_id: number; student_name: string; admission_number: string } | undefined
        if (alias) {
            return {
                student_id: alias.student_id,
                student_name: alias.student_name,
                admission_number: alias.admission_number,
                method: 'AUTO_PHONE',
                confidence: 0.9
            }
        }

        const student = this.db.prepare(`
      SELECT id, first_name || ' ' || last_name as student_name, admission_number
      FROM student
      WHERE is_active = 1 AND (
        guardian_phone = ? OR guardian_phone = ? OR
        REPLACE(guardian_phone, '+254', '0') = ? OR
        REPLACE(guardian_phone, ' ', '') = ?
      )
      LIMIT 1
    `).get(normalizedPhone, phone, normalizedPhone, normalizedPhone.replace(/\s/g, '')) as {
            id: number; student_name: string; admission_number: string
        } | undefined

        if (student) {
            return {
                student_id: student.id,
                student_name: student.student_name,
                admission_number: student.admission_number,
                method: 'AUTO_PHONE',
                confidence: 0.85
            }
        }
        return null
    }

    private matchByAdmissionNumber(accountRef: string): MatchCandidate | null {
        const trimmedRef = accountRef.trim().toUpperCase()

        const student = this.db.prepare(`
      SELECT id, first_name || ' ' || last_name as student_name, admission_number
      FROM student
      WHERE is_active = 1 AND UPPER(admission_number) = ?
      LIMIT 1
    `).get(trimmedRef) as {
            id: number; student_name: string; admission_number: string
        } | undefined

        if (student) {
            return {
                student_id: student.id,
                student_name: student.student_name,
                admission_number: student.admission_number,
                method: 'AUTO_ADMISSION',
                confidence: 0.95
            }
        }
        return null
    }
}

export { MpesaReconciliationService }
export type { MpesaImportRow, MpesaTransaction, ImportResult, MatchCandidate, MatchStatus }
