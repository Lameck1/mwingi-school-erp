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
    ACCOUNTS_PAYABLE: '2000',

    // Equity
    RETAINED_EARNINGS: '3000',

    // Revenue
    TUITION_REVENUE: '4000',

    // Expenses
    SCHOLARSHIP_EXPENSE: '5200', // Or Contra-Revenue
    BOARDING_EXPENSE: '6000',
    INVENTORY_EXPENSE: '6100', // General Inventory Consumption
} as const;

export type SystemAccountCode = typeof SystemAccounts[keyof typeof SystemAccounts];
