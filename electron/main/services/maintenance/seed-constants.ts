export interface Stream {
    id: number
    stream_code: string
    stream_name: string
}

export interface FeeCategory {
    id: number
    category_name: string
}

export interface TransactionCategory {
    id: number
    category_name: string
    category_type: string
}

export interface FeeStructureResult {
    fee_category_id: number
    category_name: string
    amount: number
}

export interface AcademicPeriod {
    yearId: number
    termId: number
}

export const RESET_TABLES: ReadonlyArray<string> = [
    'attendance', 'exam_result', 'report_card_summary', 'exam',
    'subject_allocation', 'stock_movement', 'inventory_item',
    'receipt', 'invoice_item', 'fee_invoice', 'ledger_transaction',
    'journal_entry_line', 'journal_entry',
    'fee_structure', 'enrollment', 'student', 'payroll_deduction',
    'payroll_allowance', 'payroll', 'payroll_period', 'staff_allowance',
    'staff', 'reconciliation_adjustment', 'bank_statement_line',
    'bank_statement', 'budget_revision', 'budget_line_item', 'budget',
    'approval_request', 'fixed_asset', 'report_execution_log',
    'term', 'academic_year', 'financial_period', 'audit_log',
    'message_log', 'backup_log', 'fee_category', 'stream'
]

export const STUDENT_FIRST_NAMES: ReadonlyArray<string> = [
    'Samuel', 'Grace', 'David', 'Mercy', 'John', 'Sarah', 'Isaac', 'Faith', 'Peter', 'Mary',
    'James', 'Ruth', 'Paul', 'Esther', 'Luke', 'Lydia', 'Mark', 'Martha', 'Silas', 'Chloe',
    'Timothy', 'Phoebe', 'Andrew', 'Tabitha'
]

export const STUDENT_LAST_NAMES: ReadonlyArray<string> = [
    'Kamau', 'Mutua', 'Ochieng', 'Wambui', 'Njoroge', 'Cherono', 'Kipruto', 'Anyango', 'Maina', 'Atieno',
    'Njenga', 'Muli', 'Karanja', 'Achieng', 'Kibet', 'Wanjiku', 'Omondi', 'Mwangi', 'Kirui', 'Naliaka',
    'Gitu', 'Aoko', 'Masai', 'Zahara'
]

export const STAFF_SPECS: ReadonlyArray<{ no: string; first: string; last: string; job: string; salaryShillings: number }> = [
    { no: 'ST-001', first: 'Joseph', last: 'Omondi', job: 'Head Teacher', salaryShillings: 85_000 },
    { no: 'ST-002', first: 'Catherine', last: 'Mutuku', job: 'Senior Teacher', salaryShillings: 65_000 },
    { no: 'ST-003', first: 'Philip', last: 'Kamau', job: 'Accounts Clerk', salaryShillings: 50_000 }
]

export const FEE_MAP_SHILLINGS: Partial<Record<string, { DAY: [number, number, number]; BOARDER: [number, number, number] }>> = {
    BABY: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    PP1: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    PP2: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    G1: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G2: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G3: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G4: { DAY: [5500, 3500, 700], BOARDER: [5500, 5000, 6500] },
    G5: { DAY: [5500, 3500, 700], BOARDER: [5500, 5000, 6500] },
    G6: { DAY: [5500, 3500, 1000], BOARDER: [5500, 5000, 6500] },
    G7: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] },
    G8: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] },
    G9: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] }
}
