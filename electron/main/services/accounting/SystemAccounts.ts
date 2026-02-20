/**
 * System-defined General Ledger Account Codes
 * Used for hardcoded references in business logic
 */
export const SystemAccounts = {
    // Assets
    CASH: '1010',
    BANK: '1020',
    ACCOUNTS_RECEIVABLE: '1100',
    INVENTORY_ASSET: '1200',

    // Liabilities
    ACCOUNTS_PAYABLE: '2010',
    STUDENT_CREDIT_BALANCE: '2020',
    SCHOLARSHIP_LIABILITY: '2030',
    SALARY_PAYABLE: '2100',
    PAYE_PAYABLE: '2110',
    NSSF_PAYABLE: '2120',
    NHIF_PAYABLE: '2130',
    HOUSING_LEVY_PAYABLE: '2140',

    // Equity
    RETAINED_EARNINGS: '3020',

    // Revenue
    TUITION_REVENUE: '4010',
    DONATIONS_REVENUE: '4200',
    HIRE_REVENUE: '4300',
    OTHER_REVENUE: '4300',

    // Expenses
    SALARY_EXPENSE_ACADEMIC: '5010',
    SALARY_EXPENSE_ADMIN: '5020',
    EMPLOYER_NSSF_EXPENSE: '5030',
    EMPLOYER_NHIF_EXPENSE: '5040',
    EMPLOYER_HOUSING_LEVY_EXPENSE: '5050',
    SCHOLARSHIP_EXPENSE: '5250',
    BOARDING_EXPENSE: '6000',
    INVENTORY_EXPENSE: '6100', // General Inventory Consumption
    DEPRECIATION_EXPENSE: '5600',

    // Assets (Extended)
    FIXED_ASSET: '1510',
    ACCUMULATED_DEPRECIATION: '1520',
} as const;

export type SystemAccountCode = typeof SystemAccounts[keyof typeof SystemAccounts];

import { getDatabase } from '../../database';

export function verifySystemAccounts(): void {
    const db = getDatabase();
    const missingAccounts: string[] = [];

    for (const [key, code] of Object.entries(SystemAccounts)) {
        const row = db.prepare('SELECT id FROM gl_account WHERE account_code = ?').get(code);
        if (!row) {
            missingAccounts.push(`${key} (${code})`);
        }
    }

    if (missingAccounts.length > 0) {
        console.warn('WARNING: The following System Accounts are missing from the General Ledger. This may cause errors in financial transactions:', missingAccounts.join(', '));
    }
}
