export interface BankAccount {
    id: number
    account_name: string
    account_number: string
    bank_name: string
    branch?: string
    swift_code?: string
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
    statement_reference?: string
    file_path?: string
    status: 'PENDING' | 'RECONCILED' | 'PARTIAL'
    reconciled_by_user_id?: number
    reconciled_at?: string
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
    reference?: string
    debit_amount: number
    credit_amount: number
    running_balance?: number
    is_matched: boolean
    matched_transaction_id?: number
}

export interface BankReconciliationAPI {
    getAccounts: () => Promise<BankAccount[]>
    getAccountById: (id: number) => Promise<BankAccount | null>
    createAccount: (data: any) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    getStatements: (bankAccountId?: number) => Promise<BankStatement[]>
    getStatementWithLines: (statementId: number) => Promise<{ statement: BankStatement; lines: BankStatementLine[] } | null>
    createStatement: (bankAccountId: number, statementDate: string, openingBalance: number, closingBalance: number, reference?: string) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    addStatementLine: (statementId: number, line: any) => Promise<{ success: boolean; id?: number }>
    matchTransaction: (lineId: number, transactionId: number) => Promise<{ success: boolean }>
    unmatchTransaction: (lineId: number) => Promise<{ success: boolean }>
    getUnmatchedTransactions: (startDate: string, endDate: string) => Promise<any[]>
    markReconciled: (statementId: number, userId: number) => Promise<{ success: boolean }>
}
