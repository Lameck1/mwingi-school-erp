import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

interface CurrencyStats {
    feeCount: number
    feeAverage: number
    feeMaximum: number
    invoiceAverage: number
    invoiceMaximum: number
}

const CURRENCY_COLUMNS: ReadonlyArray<{ table: string; columns: ReadonlyArray<string>; nonNullOnly?: boolean }> = [
    { table: 'fee_structure', columns: ['amount'] },
    { table: 'fee_invoice', columns: ['total_amount', 'amount', 'amount_due', 'original_amount', 'amount_paid'] },
    { table: 'invoice_item', columns: ['amount', 'original_amount', 'exemption_amount'] },
    { table: 'ledger_transaction', columns: ['amount'] },
    { table: 'receipt', columns: ['amount'] },
    { table: 'student', columns: ['credit_balance'], nonNullOnly: true }
]

export class CurrencyNormalizationService {
    async normalize(userId: number): Promise<{ success: boolean; error?: string }> {
        const db = getDatabase()

        try {
            const stats = this.collectStats(db)
            if (stats.feeCount === 0) {
                return { success: false, error: 'No fee structure data found. Nothing to normalize.' }
            }

            const divisor = this.determineDivisor(stats)
            if (divisor === 1) {
                return { success: false, error: 'Currency values appear within expected ranges. No changes applied.' }
            }

            db.transaction(() => {
                this.applyNormalization(db, divisor)
            })()

            logAudit(userId, 'UPDATE', 'currency_normalization', 0, null, {
                avg_amount: stats.feeAverage,
                max_amount: stats.feeMaximum,
                action: `Divide by ${divisor} for core financial tables`
            })

            return { success: true }
        } catch (error) {
            console.error('Currency normalization failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Normalization failed' }
        }
    }

    private collectStats(db: ReturnType<typeof getDatabase>): CurrencyStats {
        const feeStats = db.prepare(`
            SELECT COUNT(*) as count, AVG(amount) as avg_amount, MAX(amount) as max_amount
            FROM fee_structure
        `).get() as { count: number; avg_amount: number | null; max_amount: number | null }

        const invoiceStats = db.prepare(`
            SELECT AVG(total_amount) as avg_total, MAX(total_amount) as max_total
            FROM fee_invoice
        `).get() as { avg_total: number | null; max_total: number | null }

        return {
            feeCount: feeStats.count,
            feeAverage: feeStats.avg_amount ?? 0,
            feeMaximum: feeStats.max_amount ?? 0,
            invoiceAverage: invoiceStats.avg_total ?? 0,
            invoiceMaximum: invoiceStats.max_total ?? 0
        }
    }

    private determineDivisor(stats: CurrencyStats): number {
        const likelyScaled = (
            stats.feeMaximum >= 50_000_000 ||
            stats.feeAverage >= 20_000_000 ||
            stats.invoiceMaximum >= 50_000_000 ||
            stats.invoiceAverage >= 20_000_000
        )
        return likelyScaled ? 100 : 1
    }

    private applyNormalization(db: ReturnType<typeof getDatabase>, divisor: number): void {
        for (const tableConfig of CURRENCY_COLUMNS) {
            if (!this.tableExists(db, tableConfig.table)) {
                continue
            }
            for (const column of tableConfig.columns) {
                if (!this.columnExists(db, tableConfig.table, column)) {
                    continue
                }
                const whereClause = tableConfig.nonNullOnly ? ` WHERE ${column} IS NOT NULL` : ''
                db.prepare(`
                    UPDATE ${tableConfig.table}
                    SET ${column} = CAST(ROUND(${column} / ${divisor}.0) AS INTEGER)
                    ${whereClause}
                `).run()
            }
        }
    }

    private tableExists(db: ReturnType<typeof getDatabase>, tableName: string): boolean {
        const result = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name?: string } | undefined
        return Boolean(result?.name)
    }

    private columnExists(db: ReturnType<typeof getDatabase>, tableName: string, columnName: string): boolean {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
        return columns.some(column => column.name === columnName)
    }
}
