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

export const CBC_SUBJECTS: ReadonlyArray<{ code: string; name: string; isCompulsory: boolean; levels: string[] }> = [
    // BABY, PP1 & PP2
    { code: 'ENV_ACT', name: 'Environmental Activities', isCompulsory: true, levels: ['BABY', 'PP1', 'PP2'] },
    { code: 'LANG_ACT', name: 'Language Activities', isCompulsory: true, levels: ['BABY', 'PP1', 'PP2'] },
    { code: 'MATH_ACT', name: 'Mathematical Activities', isCompulsory: true, levels: ['BABY', 'PP1', 'PP2'] },
    { code: 'PSYCH_ACT', name: 'Psychomotor and Creative Activities', isCompulsory: true, levels: ['BABY', 'PP1', 'PP2'] },
    { code: 'REL_ACT', name: 'Religious Education Activities', isCompulsory: true, levels: ['BABY', 'PP1', 'PP2'] },

    // Grade 1, 2, 3
    { code: 'LIT', name: 'Literacy', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'ENG_L', name: 'English Language Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'KISW_L', name: 'Kiswahili Language Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'MATH_L', name: 'Mathematical Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'ENV_L', name: 'Environmental Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'HYG_N', name: 'Hygiene and Nutrition Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'REL_L', name: 'Religious Education Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },
    { code: 'MOV_C', name: 'Movement and Creative Activities', isCompulsory: true, levels: ['G1', 'G2', 'G3'] },

    // Grade 4, 5, 6
    { code: 'ENG_U', name: 'English', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'KISW_U', name: 'Kiswahili', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'MATH_U', name: 'Mathematics', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'SCI_U', name: 'Science and Technology', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'SOC_U', name: 'Social Studies', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'AGRI_U', name: 'Agriculture', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'HOME_U', name: 'Home Science', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'REL_U', name: 'Religious Education', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'ART_U', name: 'Creative Arts', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },
    { code: 'PE_U', name: 'Physical and Health Education', isCompulsory: true, levels: ['G4', 'G5', 'G6'] },

    // Grade 7, 8, 9 (Junior Secondary)
    { code: 'MATH_J', name: 'Mathematics', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'ENG_J', name: 'English', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'KISW_J', name: 'Kiswahili', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'INTEG_S', name: 'Integrated Science', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'HEALTH_E', name: 'Health Education', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'PRE_TECH', name: 'Pre-Technical and Pre-Career Education', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'SOC_J', name: 'Social Studies', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'AGRI_J', name: 'Agriculture', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'REL_J', name: 'Religious Education', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'PE_J', name: 'Sports and Physical Education', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'LIFE_S', name: 'Life Skills Education', isCompulsory: true, levels: ['G7', 'G8', 'G9'] },
    { code: 'BUS_S', name: 'Business Studies', isCompulsory: true, levels: ['G7', 'G8', 'G9'] }
]

export const EXAM_TYPES: ReadonlyArray<{ name: string; suffix: string }> = [
    { name: 'CAT 1', suffix: 'C1' },
    { name: 'CAT 2', suffix: 'C2' },
    { name: 'Mid-Term Exam', suffix: 'MT' },
    { name: 'End of Term Exam', suffix: 'ET' }
]
