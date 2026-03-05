import { describe, it, expect, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import {
    buildFeeInvoiceAmountSql,
    buildFeeInvoicePaidAmountSql,
    buildFeeInvoiceOutstandingBalanceSql,
    buildFeeInvoiceDateSql,
    buildFeeInvoiceActiveStatusPredicate,
    buildFeeInvoiceOutstandingStatusPredicate,
    buildFeeInvoiceStatusSql
} from '../feeInvoiceSql'

/**
 * Creates a mock better-sqlite3 Database that responds to:
 * - PRAGMA table_info(fee_invoice) → columns
 * - SELECT 1 FROM sqlite_master ... → table existence
 */
function createMockDb(columns: string[], tableExists = true) {
    return {
        prepare: vi.fn((sql: string) => {
            if (sql.includes('sqlite_master')) {
                return {
                    get: vi.fn((..._args: unknown[]) => tableExists ? { '1': 1 } : undefined),
                    all: vi.fn(() => [])
                }
            }
            if (sql.includes('PRAGMA table_info')) {
                return {
                    get: vi.fn(),
                    all: vi.fn(() => columns.map(name => ({ name })))
                }
            }
            return { get: vi.fn(), all: vi.fn(() => []) }
        })
    } as unknown as Database
}

describe('buildFeeInvoiceAmountSql', () => {
    it('returns COALESCE expression when columns are present', () => {
        const db = createMockDb(['total_amount', 'amount_due', 'amount'])
        const sql = buildFeeInvoiceAmountSql(db)
        expect(sql).toContain('COALESCE')
        expect(sql).toContain('fi.total_amount')
    })

    it('returns "0" when no amount columns exist', () => {
        const db = createMockDb(['id', 'student_id'])
        const sql = buildFeeInvoiceAmountSql(db)
        expect(sql).toBe('0')
    })

    it('uses custom alias', () => {
        const db = createMockDb(['total_amount'])
        const sql = buildFeeInvoiceAmountSql(db, 'inv')
        expect(sql).toContain('inv.total_amount')
    })
})

describe('buildFeeInvoicePaidAmountSql', () => {
    it('returns COALESCE expression when amount_paid column exists', () => {
        const db = createMockDb(['amount_paid'])
        const sql = buildFeeInvoicePaidAmountSql(db)
        expect(sql).toContain('COALESCE')
        expect(sql).toContain('fi.amount_paid')
    })

    it('returns "0" when amount_paid column is absent', () => {
        const db = createMockDb(['total_amount'])
        const sql = buildFeeInvoicePaidAmountSql(db)
        expect(sql).toBe('0')
    })
})

describe('buildFeeInvoiceOutstandingBalanceSql', () => {
    it('returns difference of amount and paid amount', () => {
        const db = createMockDb(['total_amount', 'amount_paid'])
        const sql = buildFeeInvoiceOutstandingBalanceSql(db)
        expect(sql).toContain('fi.total_amount')
        expect(sql).toContain('fi.amount_paid')
        expect(sql).toContain('(')
        expect(sql).toContain('-')
        expect(sql).toContain(')')
    })

    it('returns ((0) - (0)) when no relevant columns exist', () => {
        const db = createMockDb(['id'])
        const sql = buildFeeInvoiceOutstandingBalanceSql(db)
        expect(sql).toBe('((0) - (0))')
    })
})

describe('buildFeeInvoiceDateSql', () => {
    it('returns COALESCE with all date columns when present', () => {
        const db = createMockDb(['invoice_date', 'created_at', 'due_date'])
        const sql = buildFeeInvoiceDateSql(db)
        expect(sql).toContain('fi.invoice_date')
        expect(sql).toContain('fi.created_at')
        expect(sql).toContain('fi.due_date')
        expect(sql).toContain('COALESCE')
    })

    it('returns DATE("now") when no date columns exist', () => {
        const db = createMockDb(['id', 'student_id'])
        const sql = buildFeeInvoiceDateSql(db)
        expect(sql).toBe("DATE('now')")
    })

    it('includes substr for created_at', () => {
        const db = createMockDb(['created_at'])
        const sql = buildFeeInvoiceDateSql(db)
        expect(sql).toContain('substr(fi.created_at, 1, 10)')
    })
})

describe('buildFeeInvoiceActiveStatusPredicate', () => {
    it('returns NOT IN predicate when status column exists', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceActiveStatusPredicate(db)
        expect(sql).toContain('NOT IN')
        expect(sql).toContain('CANCELLED')
        expect(sql).toContain('VOIDED')
    })

    it('returns "1=1" when status column is absent', () => {
        const db = createMockDb(['id'])
        const sql = buildFeeInvoiceActiveStatusPredicate(db)
        expect(sql).toBe('1=1')
    })
})

describe('buildFeeInvoiceOutstandingStatusPredicate', () => {
    it('returns IN predicate with outstanding statuses when status column exists', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceOutstandingStatusPredicate(db)
        expect(sql).toContain('IN')
        expect(sql).toContain('PENDING')
        expect(sql).toContain('PARTIAL')
        expect(sql).toContain('OUTSTANDING')
    })

    it('returns "1=1" when status column is absent', () => {
        const db = createMockDb(['id'])
        const sql = buildFeeInvoiceOutstandingStatusPredicate(db)
        expect(sql).toBe('1=1')
    })
})

describe('buildFeeInvoiceStatusSql', () => {
    it('returns COALESCE with default fallback when status column exists', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceStatusSql(db)
        expect(sql).toContain('COALESCE')
        expect(sql).toContain('fi.status')
        expect(sql).toContain('PENDING')
    })

    it('returns literal fallback when status column is absent', () => {
        const db = createMockDb(['id'])
        const sql = buildFeeInvoiceStatusSql(db)
        expect(sql).toBe("'PENDING'")
    })

    it('uses custom fallback status', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceStatusSql(db, 'fi', 'ACTIVE')
        expect(sql).toContain('ACTIVE')
    })

    it('escapes single quotes in fallback status', () => {
        const db = createMockDb(['id'])
        const sql = buildFeeInvoiceStatusSql(db, 'fi', "it's")
        expect(sql).toBe("'it''s'")
    })

    it('returns fallback when table does not exist', () => {
        const db = createMockDb([], false)
        const sql = buildFeeInvoiceStatusSql(db)
        expect(sql).toBe("'PENDING'")
    })
})

// ==================== Schema cache & identifier safety ====================
describe('schema cache and identifier safety', () => {
    it('returns cached column result on second call (same db instance)', () => {
        const db = createMockDb(['status'])
        // First call populates the cache
        buildFeeInvoiceStatusSql(db)
        // Second call should use cache — still works correctly
        const sql = buildFeeInvoiceStatusSql(db)
        expect(sql).toContain('COALESCE')
    })

    it('returns cached table existence on second call', () => {
        const db = createMockDb(['total_amount'])
        buildFeeInvoiceAmountSql(db)
        const sql2 = buildFeeInvoiceAmountSql(db)
        expect(sql2).toContain('fi.total_amount')
    })

    it('buildFeeInvoiceDateSql with only invoice_date', () => {
        const db = createMockDb(['invoice_date'])
        const sql = buildFeeInvoiceDateSql(db)
        expect(sql).toContain('fi.invoice_date')
        expect(sql).not.toContain('fi.created_at')
        expect(sql).not.toContain('fi.due_date')
    })

    it('buildFeeInvoiceDateSql with only due_date', () => {
        const db = createMockDb(['due_date'])
        const sql = buildFeeInvoiceDateSql(db)
        expect(sql).toContain('fi.due_date')
        expect(sql).not.toContain('fi.invoice_date')
    })

    it('buildFeeInvoiceAmountSql includes NULLIF candidates followed by raw candidates', () => {
        const db = createMockDb(['total_amount', 'amount_due'])
        const sql = buildFeeInvoiceAmountSql(db)
        expect(sql).toContain('NULLIF(fi.total_amount, 0)')
        expect(sql).toContain('NULLIF(fi.amount_due, 0)')
        expect(sql).toContain('fi.total_amount')
        expect(sql).toContain('fi.amount_due')
    })

    it('buildFeeInvoiceAmountSql with only "amount" column', () => {
        const db = createMockDb(['amount'])
        const sql = buildFeeInvoiceAmountSql(db)
        expect(sql).toContain('fi.amount')
    })

    it('buildFeeInvoiceOutstandingBalanceSql with amount and amount_paid', () => {
        const db = createMockDb(['amount', 'amount_paid'])
        const sql = buildFeeInvoiceOutstandingBalanceSql(db)
        expect(sql).toContain('fi.amount')
        expect(sql).toContain('fi.amount_paid')
    })

    it('buildFeeInvoiceActiveStatusPredicate with custom alias', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceActiveStatusPredicate(db, 'inv')
        expect(sql).toContain('inv.status')
    })

    it('buildFeeInvoiceOutstandingStatusPredicate with custom alias', () => {
        const db = createMockDb(['status'])
        const sql = buildFeeInvoiceOutstandingStatusPredicate(db, 'inv')
        expect(sql).toContain('inv.status')
    })

    it('buildFeeInvoicePaidAmountSql with custom alias', () => {
        const db = createMockDb(['amount_paid'])
        const sql = buildFeeInvoicePaidAmountSql(db, 'inv')
        expect(sql).toContain('inv.amount_paid')
    })
})
