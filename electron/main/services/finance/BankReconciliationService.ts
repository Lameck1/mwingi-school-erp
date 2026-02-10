import { getDatabase } from '../../database'
import { BaseService as _BaseService } from '../base/BaseService'

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
    ): Promise<{ success: boolean; id?: number }> {
        try {
            const result = this.db.prepare(`
        INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, reference, debit_amount, credit_amount, running_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
                statementId,
                line.transaction_date,
                line.description,
                line.reference || null,
                line.debit_amount || 0,
                line.credit_amount || 0,
                line.running_balance || null
            )

            return { success: true, id: result.lastInsertRowid as number }
        } catch {
            return { success: false }
        }
    }

    // ===== RECONCILIATION =====

    async matchTransaction(lineId: number, transactionId: number): Promise<{ success: boolean }> {
        try {
            this.db.prepare(`
        UPDATE bank_statement_line SET is_matched = 1, matched_transaction_id = ? WHERE id = ?
      `).run(transactionId, lineId)

            return { success: true }
        } catch {
            return { success: false }
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

    async getUnmatchedLedgerTransactions(startDate: string, endDate: string): Promise<unknown[]> {
        return this.db.prepare(`
      SELECT lt.*, tc.category_name
      FROM ledger_transaction lt
      LEFT JOIN transaction_category tc ON lt.category_id = tc.id
      WHERE lt.transaction_date BETWEEN ? AND ?
        AND lt.is_voided = 0
        AND lt.id NOT IN (SELECT matched_transaction_id FROM bank_statement_line WHERE matched_transaction_id IS NOT NULL)
      ORDER BY lt.transaction_date DESC
    `).all(startDate, endDate)
    }

    async markStatementReconciled(statementId: number, userId: number): Promise<{ success: boolean }> {
        try {
            this.db.prepare(`
        UPDATE bank_statement 
        SET status = 'RECONCILED', reconciled_by_user_id = ?, reconciled_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(userId, statementId)

            return { success: true }
        } catch {
            return { success: false }
        }
    }
}
