import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import { REPORT_EXPENSE_TRANSACTION_TYPES, REPORT_INCOME_TRANSACTION_TYPES, asSqlInList } from '../../utils/financeTransactionTypes'
import { validateAmount, sanitizeString, validatePastOrTodayDate } from '../../utils/validation'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

interface TransactionData {
    transaction_date: string
    transaction_type: 'INCOME' | 'EXPENSE'
    category_id: number
    amount: number
    payment_method: string
    payment_reference?: string
    description?: string
    force_budget_override?: boolean
    budget_override_reason?: string
    budget_department?: string | null
}

interface TransactionFilters {
    startDate?: string
    endDate?: string
    type?: string
}

async function createTransaction(
    db: ReturnType<typeof getDatabase>,
    data: TransactionData,
    userId: number
): Promise<{ success: boolean; id?: number | bigint; error?: string }> {
    const vAmount = validateAmount(data.amount)
    if (!vAmount.success) { return { success: false, error: vAmount.error! } }
    const vDate = validatePastOrTodayDate(data.transaction_date)
    if (!vDate.success) { return { success: false, error: vDate.error! } }

    const amountCents = vAmount.data!
    const transactionDate = vDate.data!
    const description = sanitizeString(data.description)
    const paymentRef = sanitizeString(data.payment_reference)
    const txnRef = `TXN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-6)}`
    const debitCredit = data.transaction_type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
    const category = db.prepare('SELECT gl_account_code, category_type FROM transaction_category WHERE id = ?')
        .get(data.category_id) as { gl_account_code: string | null; category_type: string } | undefined

    if (!category) {
        return { success: false, error: 'Selected category does not exist' }
    }

    if (data.transaction_type === 'EXPENSE' && category.gl_account_code) {
        const fiscalYear = Number(transactionDate.slice(0, 4))
        const budgetService = container.resolve('BudgetEnforcementService')
        const budgetValidation = await budgetService.validateTransaction(
            category.gl_account_code,
            amountCents,
            fiscalYear,
            data.budget_department ?? null
        )

        if (!budgetValidation.is_allowed) {
            const hasUserTable = Boolean(db.prepare(`
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = 'user'
            `).get() as { name: string } | undefined)

            const userRole = hasUserTable
                ? (db.prepare('SELECT role FROM user WHERE id = ?').get(userId) as { role: string } | undefined)?.role
                : undefined
            const isAdmin = userRole === 'ADMIN'
            const requestedOverride = data.force_budget_override === true
            const overrideReason = sanitizeString(data.budget_override_reason, 500)

            if (!isAdmin || !requestedOverride || !overrideReason) {
                return { success: false, error: budgetValidation.message }
            }

            logAudit(userId, 'BUDGET_OVERRIDE', 'ledger_transaction', 0, null, {
                amount: amountCents,
                category_id: data.category_id,
                gl_account_code: category.gl_account_code,
                fiscal_year: fiscalYear,
                reason: overrideReason,
                department: data.budget_department ?? null
            })
        }
    }

    try {
        return db.transaction(() => {
        const stmt = db.prepare(`INSERT INTO ledger_transaction (
            transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
            payment_method, payment_reference, description, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

        const result = stmt.run(
            txnRef, transactionDate, data.transaction_type, data.category_id,
            amountCents, debitCredit, data.payment_method, paymentRef,
            description, userId
        )

        logAudit(userId, 'CREATE', 'ledger_transaction', result.lastInsertRowid as number, null, { ...data, amount: amountCents })

        const journalService = container.resolve('DoubleEntryJournalService')

        const cashCode = data.payment_method === 'CASH' ? '1010' : '1020'
        let debitCode: string
        let creditCode: string
        let entryType: string

        if (data.transaction_type === 'EXPENSE') {
            debitCode = category?.gl_account_code || '5900'
            creditCode = cashCode
            entryType = 'EXPENSE'
        } else {
            debitCode = cashCode
            creditCode = category?.gl_account_code || '4300'
            entryType = 'INCOME'
        }

        const journalResult = journalService.createJournalEntrySync({
            entry_date: transactionDate,
            entry_type: entryType,
            description: sanitizeString(data.description) || `${data.transaction_type} transaction`,
            created_by_user_id: userId,
            lines: [
                { gl_account_code: debitCode, debit_amount: amountCents, credit_amount: 0, description: `Debit: ${data.transaction_type}` },
                { gl_account_code: creditCode, debit_amount: 0, credit_amount: amountCents, description: `Credit: ${data.transaction_type}` }
            ]
        })
        if (!journalResult.success) {
            throw new Error(journalResult.error || 'Failed to create journal entry')
        }

        return { success: true, id: result.lastInsertRowid }
        })()
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export function registerTransactionsHandlers(): void {
    const db = getDatabase()
    const incomeTypesSql = asSqlInList(REPORT_INCOME_TRANSACTION_TYPES)
    const expenseTypesSql = asSqlInList(REPORT_EXPENSE_TRANSACTION_TYPES)

    safeHandleRawWithRole('transaction:getCategories', ROLES.STAFF, () => {
        return db.prepare('SELECT * FROM transaction_category WHERE is_active = 1 ORDER BY category_name').all()
    })

    safeHandleRawWithRole('transaction:createCategory', ROLES.FINANCE, (_event, name: string, type: string) => {
        const trimmedName = typeof name === 'string' ? name.trim() : ''
        if (!trimmedName) {
            return { success: false, error: 'Category name is required' }
        }
        if (type !== 'INCOME' && type !== 'EXPENSE') {
            return { success: false, error: 'Category type must be INCOME or EXPENSE' }
        }
        const stmt = db.prepare('INSERT INTO transaction_category (category_name, category_type) VALUES (?, ?)')
        const result = stmt.run(trimmedName, type)
        return { success: true, id: result.lastInsertRowid }
    })

    safeHandleRawWithRole('transaction:create', ROLES.FINANCE, (event, data: TransactionData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return { success: false, error: actor.error } }
        return createTransaction(db, data, actor.actorId)
    })

    safeHandleRawWithRole('transaction:getAll', ROLES.FINANCE, (_event, filters?: TransactionFilters) => {
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

    safeHandleRawWithRole('transaction:getSummary', ROLES.FINANCE, (_event, startDate: string, endDate: string) => {
        const income = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM ledger_transaction 
            WHERE is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
            AND transaction_type IN (${incomeTypesSql})
        `).get(startDate, endDate) as { total: number }

        const expense = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM ledger_transaction 
            WHERE is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
            AND transaction_type IN (${expenseTypesSql})
        `).get(startDate, endDate) as { total: number }

        return {
            totalIncome: income.total || 0,
            totalExpense: expense.total || 0,
            netBalance: (income.total || 0) - (expense.total || 0)
        }
    })
}


















