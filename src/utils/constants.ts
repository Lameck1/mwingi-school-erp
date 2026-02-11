/**
 * Shared constants and enums for the Mwingi School ERP application
 * These replace magic strings used throughout the codebase
 */

// Transaction types for ledger entries
export const TRANSACTION_TYPES = {
    FEE_PAYMENT: 'FEE_PAYMENT',
    DONATION: 'DONATION',
    GRANT: 'GRANT',
    EXPENSE: 'EXPENSE',
    SALARY_PAYMENT: 'SALARY_PAYMENT',
    REFUND: 'REFUND',
    OPENING_BALANCE: 'OPENING_BALANCE',
    ADJUSTMENT: 'ADJUSTMENT',
    INCOME: 'INCOME',
} as const

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES]

// Student types
export const STUDENT_TYPES = {
    DAY_SCHOLAR: 'DAY_SCHOLAR',
    BOARDER: 'BOARDER',
} as const

export type StudentType = typeof STUDENT_TYPES[keyof typeof STUDENT_TYPES]

// Array form for iteration
export const STUDENT_TYPES_LIST = Object.values(STUDENT_TYPES)

// Invoice statuses
export const INVOICE_STATUS = {
    PENDING: 'PENDING',
    PARTIAL: 'PARTIAL',
    PAID: 'PAID',
    CANCELLED: 'CANCELLED',
} as const

export type InvoiceStatus = typeof INVOICE_STATUS[keyof typeof INVOICE_STATUS]

// Payment methods
export const PAYMENT_METHODS = {
    CASH: 'CASH',
    MPESA: 'MPESA',
    BANK_TRANSFER: 'BANK_TRANSFER',
    CHEQUE: 'CHEQUE',
} as const

export type PaymentMethod = typeof PAYMENT_METHODS[keyof typeof PAYMENT_METHODS]

// User roles
export const USER_ROLES = {
    ADMIN: 'ADMIN',
    ACCOUNTS_CLERK: 'ACCOUNTS_CLERK',
    AUDITOR: 'AUDITOR',
} as const

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES]

// Payroll period statuses
export const PAYROLL_STATUS = {
    DRAFT: 'DRAFT',
    CONFIRMED: 'CONFIRMED',
    PAID: 'PAID',
} as const

export type PayrollStatus = typeof PAYROLL_STATUS[keyof typeof PAYROLL_STATUS]

// Stock movement types
export const STOCK_MOVEMENT_TYPES = {
    IN: 'IN',
    OUT: 'OUT',
    ADJUSTMENT: 'ADJUSTMENT',
} as const

export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[keyof typeof STOCK_MOVEMENT_TYPES]
