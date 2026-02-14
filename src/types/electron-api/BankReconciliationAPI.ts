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

export interface UnmatchedTransaction {
    id: number
    description: string
    transaction_ref: string
    transaction_date: string
    amount: number
}

export interface BankReconciliationAPI {
    // Aliases exposed in preload
    getBankAccounts: () => Promise<BankAccount[]>
    getBankAccountById: (id: number) => Promise<BankAccount | null>
    createBankAccount: (data: unknown) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    getBankStatements: (bankAccountId?: number) => Promise<BankStatement[]>
    getBankStatementWithLines: (statementId: number) => Promise<{ statement: BankStatement; lines: BankStatementLine[] } | null>
    createBankStatement: (bankAccountId: number, statementDate: string, openingBalance: number, closingBalance: number, reference?: string) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    matchBankTransaction: (lineId: number, transactionId: number) => Promise<{ success: boolean; error?: string }>
    unmatchBankTransaction: (lineId: number) => Promise<{ success: boolean }>
    getUnmatchedTransactions: (startDate: string, endDate: string, bankAccountId?: number) => Promise<UnmatchedTransaction[]>
    markStatementReconciled: (statementId: number, userId: number) => Promise<{ success: boolean; error?: string }>

    // Canonical names
    getAccounts: () => Promise<BankAccount[]>
    getAccountById: (id: number) => Promise<BankAccount | null>
    createAccount: (data: unknown) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    getStatements: (bankAccountId?: number) => Promise<BankStatement[]>
    getStatementWithLines: (statementId: number) => Promise<{ statement: BankStatement; lines: BankStatementLine[] } | null>
    createStatement: (bankAccountId: number, statementDate: string, openingBalance: number, closingBalance: number, reference?: string) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    addStatementLine: (statementId: number, line: unknown) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    matchTransaction: (lineId: number, transactionId: number) => Promise<{ success: boolean; error?: string }>
    unmatchTransaction: (lineId: number) => Promise<{ success: boolean }>
    markReconciled: (statementId: number, userId: number) => Promise<{ success: boolean; error?: string }>
}

