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
    SALARY_PAYABLE: '2100',

    // Equity
    RETAINED_EARNINGS: '3020',

    // Revenue
    TUITION_REVENUE: '4010',

    // Expenses
    SCHOLARSHIP_EXPENSE: '5250',
    BOARDING_EXPENSE: '6000',
    INVENTORY_EXPENSE: '6100', // General Inventory Consumption
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
