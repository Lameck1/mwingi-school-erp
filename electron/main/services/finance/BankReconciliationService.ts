import { getDatabase } from '../../database'

export interface BankAccount {
    id: number
    account_name: string
    account_number: string
    bank_name: string
    branch: string | null
    swift_code: string | null
    currency: string
    opening_balance: number
    current_balance: number
    is_active: boolean
    created_at: string
}

export interface BankStatement {
    id: number
    bank_account_id: number
    statement_date: string
    opening_balance: number
    closing_balance: number
    statement_reference: string | null
    file_path: string | null
    status: 'PENDING' | 'RECONCILED' | 'PARTIAL'
    reconciled_by_user_id: number | null
    reconciled_at: string | null
    created_at: string
    // Computed
    bank_account_name?: string
    line_count?: number
    matched_count?: number
}

export interface BankStatementLine {
    id: number
    bank_statement_id: number
    transaction_date: string
    description: string
    reference: string | null
    debit_amount: number
    credit_amount: number
    running_balance: number | null
    is_matched: boolean
    matched_transaction_id: number | null
    created_at: string
}

export interface CreateBankAccountData {
    account_name: string
    account_number: string
    bank_name: string
    branch?: string
    swift_code?: string
    currency?: string
    opening_balance: number
}

export class BankReconciliationService {
    private get db() { return getDatabase() }
    private static readonly AMOUNT_TOLERANCE_CENTS = 100
    private static readonly DATE_TOLERANCE_DAYS = 7
    private static readonly ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

    private formatLocalDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    private isIsoDate(value: string): boolean {
        if (!BankReconciliationService.ISO_DATE_REGEX.test(value)) {
            return false
        }
        const parsed = new Date(`${value}T00:00:00`)
        return !Number.isNaN(parsed.getTime()) && this.formatLocalDate(parsed) === value
    }

    // ===== BANK ACCOUNTS =====

    async getBankAccounts(): Promise<BankAccount[]> {
        return this.db.prepare(`
      SELECT * FROM bank_account WHERE is_active = 1 ORDER BY account_name
    `).all() as BankAccount[]
    }

    async getBankAccountById(id: number): Promise<BankAccount | null> {
        return this.db.prepare(`SELECT * FROM bank_account WHERE id = ?`).get(id) as BankAccount | null
    }

    async createBankAccount(data: CreateBankAccountData): Promise<{ success: boolean; id?: number; errors?: string[] }> {
        const errors: string[] = []

        if (!data.account_name.trim()) {errors.push('Account name is required')}
        if (!data.account_number.trim()) {errors.push('Account number is required')}
        if (!data.bank_name.trim()) {errors.push('Bank name is required')}

        if (errors.length > 0) {return { success: false, errors }}

        try {
            const result = this.db.prepare(`
        INSERT INTO bank_account (account_name, account_number, bank_name, branch, swift_code, currency, opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                data.account_name,
                data.account_number,
                data.bank_name,
                data.branch || null,
                data.swift_code || null,
                data.currency || 'KES',
                data.opening_balance || 0,
                data.opening_balance || 0
            )

            return { success: true, id: result.lastInsertRowid as number }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    // ===== BANK STATEMENTS =====

    async getStatements(bankAccountId?: number): Promise<BankStatement[]> {
        let query = `
      SELECT bs.*, ba.account_name as bank_account_name,
             (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id) as line_count,
             (SELECT COUNT(*) FROM bank_statement_line WHERE bank_statement_id = bs.id AND is_matched = 1) as matched_count
      FROM bank_statement bs
      LEFT JOIN bank_account ba ON bs.bank_account_id = ba.id
    `

        if (bankAccountId) {
            query += ` WHERE bs.bank_account_id = ?`
            return this.db.prepare(query + ' ORDER BY bs.statement_date DESC').all(bankAccountId) as BankStatement[]
        }

        return this.db.prepare(query + ' ORDER BY bs.statement_date DESC').all() as BankStatement[]
    }

    async getStatementWithLines(statementId: number): Promise<{ statement: BankStatement; lines: BankStatementLine[] } | null> {
        const statement = this.db.prepare(`
      SELECT bs.*, ba.account_name as bank_account_name
      FROM bank_statement bs
      LEFT JOIN bank_account ba ON bs.bank_account_id = ba.id
      WHERE bs.id = ?
    `).get(statementId) as BankStatement | null

        if (!statement) {return null}

        const lines = this.db.prepare(`
      SELECT * FROM bank_statement_line WHERE bank_statement_id = ? ORDER BY transaction_date, id
    `).all(statementId) as BankStatementLine[]

        return { statement, lines }
    }

    async createStatement(
        bankAccountId: number,
        statementDate: string,
        openingBalance: number,
        closingBalance: number,
        reference?: string
    ): Promise<{ success: boolean; id?: number; errors?: string[] }> {
        try {
            const result = this.db.prepare(`
        INSERT INTO bank_statement (bank_account_id, statement_date, opening_balance, closing_balance, statement_reference)
        VALUES (?, ?, ?, ?, ?)
      `).run(bankAccountId, statementDate, openingBalance, closingBalance, reference || null)

            return { success: true, id: result.lastInsertRowid as number }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    async addStatementLine(
        statementId: number,
        line: Omit<BankStatementLine, 'id' | 'bank_statement_id' | 'created_at' | 'is_matched' | 'matched_transaction_id'>
    ): Promise<{ success: boolean; id?: number; errors?: string[] }> {
        const errors: string[] = []
        if (!Number.isFinite(statementId) || statementId <= 0) {
            errors.push('Invalid bank statement ID')
        }

        const statement = this.db.prepare(`
      SELECT id, statement_date
      FROM bank_statement
      WHERE id = ?
    `).get(statementId) as { id: number; statement_date: string } | undefined
        if (!statement) {
            errors.push('Bank statement not found')
        }

        const description = line.description?.trim() || ''
        if (!description) {
            errors.push('Statement line description is required')
        }

        const transactionDate = String(line.transaction_date || '')
        if (!this.isIsoDate(transactionDate)) {
            errors.push('Statement line date must be in YYYY-MM-DD format')
        } else {
            const today = this.formatLocalDate(new Date())
            if (transactionDate > today) {
                errors.push('Statement line date cannot be in the future')
            }
            if (statement && transactionDate > statement.statement_date) {
                errors.push('Statement line date cannot be after the statement date')
            }
        }

        const debitAmount = Number(line.debit_amount)
        const creditAmount = Number(line.credit_amount)
        if (!Number.isFinite(debitAmount) || !Number.isFinite(creditAmount)) {
            errors.push('Debit and credit amounts must be valid numbers')
        } else {
            if (debitAmount < 0 || creditAmount < 0) {
                errors.push('Debit and credit amounts cannot be negative')
            }
            const hasDebit = debitAmount > 0
            const hasCredit = creditAmount > 0
            if (hasDebit === hasCredit) {
                errors.push('Exactly one of debit amount or credit amount must be greater than zero')
            }
        }

        if (line.running_balance != null && !Number.isFinite(Number(line.running_balance))) {
            errors.push('Running balance must be a valid number when provided')
        }

        if (errors.length > 0) {
            return { success: false, errors: Array.from(new Set(errors)) }
        }

        try {
            const result = this.db.prepare(`
        INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, reference, debit_amount, credit_amount, running_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
                statementId,
                transactionDate,
                description,
                line.reference?.trim() || null,
                debitAmount || 0,
                creditAmount || 0,
                line.running_balance != null ? Number(line.running_balance) : null
            )

            return { success: true, id: result.lastInsertRowid as number }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to add statement line'] }
        }
    }

    // ===== RECONCILIATION =====

    async matchTransaction(lineId: number, transactionId: number): Promise<{ success: boolean; error?: string }> {
        try {
            const line = this.db.prepare(`
        SELECT
          bsl.id,
          bsl.transaction_date,
          bsl.debit_amount,
          bsl.credit_amount,
          bsl.is_matched,
          bsl.matched_transaction_id,
          bs.bank_account_id
        FROM bank_statement_line bsl
        JOIN bank_statement bs ON bs.id = bsl.bank_statement_id
        WHERE bsl.id = ?
      `).get(lineId) as {
                id: number
                transaction_date: string
                debit_amount: number
                credit_amount: number
                is_matched: number
                matched_transaction_id: number | null
                bank_account_id: number
            } | undefined

            if (!line) {
                return { success: false, error: 'Bank statement line not found' }
            }
            if (line.is_matched || line.matched_transaction_id) {
                return { success: false, error: 'Bank statement line is already matched' }
            }

            const transaction = this.db.prepare(`
        SELECT id, transaction_date, amount, is_voided, payment_method, payment_reference, description
        FROM ledger_transaction
        WHERE id = ?
      `).get(transactionId) as {
                id: number
                transaction_date: string
                amount: number
                is_voided: number
                payment_method?: string | null
                payment_reference?: string | null
                description?: string | null
            } | undefined

            if (!transaction || transaction.is_voided) {
                return { success: false, error: 'Ledger transaction not found or already voided' }
            }

            const existingMatch = this.db.prepare(`
        SELECT bsl.id, bs.bank_account_id
        FROM bank_statement_line bsl
        JOIN bank_statement bs ON bs.id = bsl.bank_statement_id
        WHERE bsl.matched_transaction_id = ?
          AND bsl.id != ?
        LIMIT 1
      `).get(transactionId, lineId) as { id: number; bank_account_id: number } | undefined
            if (existingMatch) {
                return { success: false, error: 'Ledger transaction is already reconciled to another statement line' }
            }

            if (transaction.payment_method === 'BANK_TRANSFER' || transaction.payment_method === 'CHEQUE') {
                const account = this.db.prepare(`
          SELECT account_name, account_number
          FROM bank_account
          WHERE id = ?
        `).get(line.bank_account_id) as { account_name: string; account_number: string } | undefined

                if (account && transaction.payment_reference) {
                    const ref = transaction.payment_reference.toLowerCase()
                    const accountNumber = account.account_number.toLowerCase()
                    const accountName = account.account_name.toLowerCase()
                    const description = (transaction.description || '').toLowerCase()
                    const isScoped =
                        ref.includes(accountNumber) ||
                        ref.includes(accountName) ||
                        description.includes(accountName)
                    if (!isScoped) {
                        return { success: false, error: 'Ledger transaction does not appear to belong to the selected bank account' }
                    }
                }
            }

            const statementAmount = Math.abs((line.credit_amount || 0) - (line.debit_amount || 0))
            const ledgerAmount = Math.abs(transaction.amount || 0)
            if (Math.abs(statementAmount - ledgerAmount) > BankReconciliationService.AMOUNT_TOLERANCE_CENTS) {
                return {
                    success: false,
                    error: `Amount mismatch exceeds tolerance (${BankReconciliationService.AMOUNT_TOLERANCE_CENTS} cents)`
                }
            }

            const lineDate = new Date(line.transaction_date)
            const ledgerDate = new Date(transaction.transaction_date)
            const dateDiffDays = Math.abs(lineDate.getTime() - ledgerDate.getTime()) / (1000 * 60 * 60 * 24)
            if (dateDiffDays > BankReconciliationService.DATE_TOLERANCE_DAYS) {
                return {
                    success: false,
                    error: `Date mismatch exceeds ${BankReconciliationService.DATE_TOLERANCE_DAYS}-day tolerance`
                }
            }

            const update = this.db.prepare(`
        UPDATE bank_statement_line
        SET is_matched = 1, matched_transaction_id = ?
        WHERE id = ?
          AND is_matched = 0
          AND matched_transaction_id IS NULL
      `).run(transactionId, lineId)

            if (update.changes === 0) {
                return { success: false, error: 'Statement line was updated by another process. Reload and retry.' }
            }

            return { success: true }
        } catch {
            return { success: false, error: 'Failed to match transaction' }
        }
    }

    async unmatchTransaction(lineId: number): Promise<{ success: boolean }> {
        try {
            this.db.prepare(`
        UPDATE bank_statement_line SET is_matched = 0, matched_transaction_id = NULL WHERE id = ?
      `).run(lineId)

            return { success: true }
        } catch {
            return { success: false }
        }
    }

    async getUnmatchedLedgerTransactions(startDate: string, endDate: string, bankAccountId?: number): Promise<unknown[]> {
        let query = `
      SELECT lt.*, tc.category_name
      FROM ledger_transaction lt
      LEFT JOIN transaction_category tc ON lt.category_id = tc.id
      WHERE lt.transaction_date BETWEEN ? AND ?
        AND lt.is_voided = 0
        AND lt.id NOT IN (
          SELECT matched_transaction_id
          FROM bank_statement_line
          WHERE matched_transaction_id IS NOT NULL
        )
    `
        const params: unknown[] = [startDate, endDate]

        if (bankAccountId && bankAccountId > 0) {
            const account = this.db.prepare(`
        SELECT account_name, account_number
        FROM bank_account
        WHERE id = ?
      `).get(bankAccountId) as { account_name: string; account_number: string } | undefined

            if (account) {
                query += `
        AND (
          lt.payment_method NOT IN ('BANK_TRANSFER', 'CHEQUE')
          OR COALESCE(lt.payment_reference, '') LIKE ?
          OR COALESCE(lt.description, '') LIKE ?
        )
      `
                params.push(`%${account.account_number}%`, `%${account.account_name}%`)
            }
        }

        query += ' ORDER BY lt.transaction_date DESC'
        return this.db.prepare(query).all(...params)
    }

    async markStatementReconciled(statementId: number, userId: number): Promise<{ success: boolean; error?: string }> {
        try {
            const statement = this.db.prepare(`
        SELECT id, opening_balance, closing_balance, status
        FROM bank_statement
        WHERE id = ?
      `).get(statementId) as { id: number, opening_balance: number, closing_balance: number, status: string } | undefined
            if (!statement) {
                return { success: false, error: 'Bank statement not found' }
            }
            if (statement.status === 'RECONCILED') {
                return { success: false, error: 'Statement already reconciled' }
            }

            const lineStats = this.db.prepare(`
        SELECT
          COUNT(*) as total_lines,
          SUM(CASE WHEN is_matched = 1 THEN 1 ELSE 0 END) as matched_lines,
          COALESCE(SUM(credit_amount - debit_amount), 0) as net_movement
        FROM bank_statement_line
        WHERE bank_statement_id = ?
      `).get(statementId) as { total_lines: number, matched_lines: number, net_movement: number } | undefined

            if (!lineStats || lineStats.total_lines === 0) {
                return { success: false, error: 'Statement has no lines to reconcile' }
            }

            if (lineStats.matched_lines !== lineStats.total_lines) {
                return { success: false, error: 'All statement lines must be matched before reconciliation' }
            }

            const calculatedClosing = statement.opening_balance + lineStats.net_movement
            if (Math.abs(calculatedClosing - statement.closing_balance) > 1) {
                return { success: false, error: 'Closing balance does not match statement movements' }
            }

            this.db.prepare(`
        UPDATE bank_statement 
        SET status = 'RECONCILED', reconciled_by_user_id = ?, reconciled_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status != 'RECONCILED'
      `).run(userId, statementId)

            // Update bank account current_balance to match closing balance
            const bankAccountRow = this.db.prepare(`
        SELECT bank_account_id FROM bank_statement WHERE id = ?
      `).get(statementId) as { bank_account_id: number } | undefined
            if (bankAccountRow) {
                this.db.prepare(`
          UPDATE bank_account SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(statement.closing_balance, bankAccountRow.bank_account_id)
            }

            return { success: true }
        } catch {
            return { success: false, error: 'Failed to reconcile statement' }
        }
    }
}
