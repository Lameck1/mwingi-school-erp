import { z } from 'zod'

export const PayrollRunSchema = z.tuple([
    z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12'),
    z.number().int().min(2000, 'Invalid year'),
    z.number().optional() // legacyUserId
])

export const PayrollConfirmSchema = z.tuple([
    z.number().int().positive(),
    z.number().optional()
])

export const PayrollMarkPaidSchema = z.tuple([
    z.number().int().positive(),
    z.number().optional()
])

export const PayrollRevertSchema = z.tuple([
    z.number().int().positive(),
    z.number().optional()
])

// Staff Allowance schemas
export const StaffAllowanceAddSchema = z.tuple([
    z.number().int().positive(), // staffId
    z.string().min(1, 'Allowance name required'),
    z.number().min(0, 'Amount must be positive')
])

export const StaffAllowanceDeleteSchema = z.number().int().positive()
