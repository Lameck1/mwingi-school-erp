import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ipcMain } from '../../electron-env'
import { validateAmount, sanitizeString } from '../../utils/validation'

import type { IpcMainInvokeEvent } from 'electron'

interface TransactionData {
    transaction_date: string
    transaction_type: 'INCOME' | 'EXPENSE'
    category_id: number
    amount: number
    payment_method: string
    payment_reference?: string
    description?: string
}

interface TransactionFilters {
    startDate?: string
    endDate?: string
    type?: string
}

export function registerTransactionsHandlers(): void {
    const db = getDatabase()

    // ======== TRANSACTIONS (GENERAL) ========
    ipcMain.handle('transaction:getCategories', async () => {
        return db.prepare('SELECT * FROM transaction_category WHERE is_active = 1 ORDER BY category_name').all()
    })

    ipcMain.handle('transaction:createCategory', async (_event: IpcMainInvokeEvent, name: string, type: string) => {
        const stmt = db.prepare('INSERT INTO transaction_category (category_name, category_type) VALUES (?, ?)')
        const result = stmt.run(name, type)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('transaction:create', async (_event: IpcMainInvokeEvent, data: TransactionData, userId: number): Promise<{ success: boolean, id?: number | bigint, message?: string }> => {
        // --- VALIDATION ---
        const vAmount = validateAmount(data.amount)
        if (!vAmount.success) {return { success: false, message: vAmount.error! }}

        const amountCents = vAmount.data!
        const description = sanitizeString(data.description)
        const paymentRef = sanitizeString(data.payment_reference)

        const txnRef = `TXN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-6)}`

        const stmt = db.prepare(`INSERT INTO ledger_transaction (
            transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
            payment_method, payment_reference, description, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

        const debitCredit = data.transaction_type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'

        const result = stmt.run(
            txnRef, data.transaction_date, data.transaction_type, data.category_id,
            amountCents, debitCredit, data.payment_method, paymentRef,
            description, userId
        )

        logAudit(userId, 'CREATE', 'ledger_transaction', result.lastInsertRowid as number, null, { ...data, amount: amountCents })
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('transaction:getAll', async (_event: IpcMainInvokeEvent, filters?: TransactionFilters) => {
        let query = `SELECT t.*, c.category_name, u.full_name as recorded_by 
                     FROM ledger_transaction t
                     LEFT JOIN transaction_category c ON t.category_id = c.id
                     LEFT JOIN user u ON t.recorded_by_user_id = u.id
                     WHERE t.is_voided = 0`

        const params: unknown[] = []

        if (filters?.startDate && filters.endDate) {
            query += ` AND t.transaction_date BETWEEN ? AND ?`
            params.push(filters.startDate, filters.endDate)
        }
        if (filters?.type) {
            query += ` AND t.transaction_type = ?`
            params.push(filters.type)
        }

        query += ` ORDER BY t.transaction_date DESC`
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('transaction:getSummary', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        const income = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM ledger_transaction 
            WHERE is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
            AND transaction_type IN ('INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT')
        `).get(startDate, endDate) as { total: number }

        const expense = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM ledger_transaction 
            WHERE is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
            AND transaction_type IN ('EXPENSE', 'SALARY_PAYMENT', 'REFUND')
        `).get(startDate, endDate) as { total: number }

        return {
            totalIncome: income.total || 0,
            totalExpense: expense.total || 0,
            netBalance: (income.total || 0) - (expense.total || 0)
        }
    })
}


















