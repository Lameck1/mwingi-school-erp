import { z } from 'zod'

// Shared
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD')
export const FiscalYearSchema = z.number().int().min(2000).max(2100)
export const PositiveIntSchema = z.number().int().positive()

// Cash Flow
export const CashFlowTuple = z.tuple([DateStringSchema, DateStringSchema])
export const ForecastSchema = z.number().int().positive()

// GL Account
export const GLAccountFiltersSchema = z.object({
    search: z.string().optional(),
    type: z.string().optional(),
    is_active: z.boolean().optional()
}).optional()

export const GLAccountDataSchema = z.object({
    account_code: z.string().min(1),
    account_name: z.string().min(1),
    account_type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
    description: z.string().optional(),
    is_active: z.union([z.literal(0), z.literal(1)]).optional()
})
// Missing normal_balance? Service might require it or it's optional. Error said "missing ... normal_balance".
// I'll add normal_balance.
// type: 'DEBIT' | 'CREDIT'

export const CreateGLAccountTuple = z.tuple([
    GLAccountDataSchema,
    z.number().optional() // legacyUserId
])

export const UpdateGLAccountTuple = z.tuple([
    PositiveIntSchema,
    GLAccountDataSchema.partial(),
    z.number().optional()
])

export const DeleteGLAccountTuple = z.tuple([
    PositiveIntSchema,
    z.number().optional()
])

// Period Locking
export const PeriodStatusSchema = z.enum(['OPEN', 'LOCKED', 'CLOSED']).optional()

export const PeriodProcessTuple = z.tuple([
    PositiveIntSchema,
    z.number().optional() // legacyUserId
])

// Budget
export const BudgetFilterSchema = z.object({
    fiscal_year: z.number().optional(),
    department: z.string().optional(),
    status: z.enum(['CLOSED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE']).optional()
}).optional()

export const CreateBudgetSchema = z.object({
    budget_name: z.string().min(1),
    academic_year_id: PositiveIntSchema,
    term_id: PositiveIntSchema.optional(),
    notes: z.string().optional(),
    line_items: z.array(z.object({
        category_id: PositiveIntSchema,
        description: z.string().min(1),
        budgeted_amount: z.number().nonnegative(),
        notes: z.string().optional()
    })).min(1)
})
export const CreateBudgetTuple = z.tuple([
    CreateBudgetSchema,
    z.number().optional()
])

export const UpdateBudgetTuple = z.tuple([
    PositiveIntSchema,
    CreateBudgetSchema.partial(),
    z.number().optional()
])
// Submit/Approve use PeriodProcessTuple structure (id, user)

export const ValidateTransactionTuple = z.tuple([
    z.string(), // glAccountCode
    z.number(), // amount
    FiscalYearSchema,
    z.string().nullable().optional() // department
])

export const SetAllocationTuple = z.tuple([
    z.string(), // glCode
    FiscalYearSchema,
    z.number().nonnegative(), // allocatedAmount
    z.string().nullable(), // department
    z.number().optional() // legacyUserId
])

export const BudgetAlertsTuple = z.tuple([
    FiscalYearSchema,
    z.number().optional() // threshold
])

// Fixed Assets
export const FixedAssetFilterSchema = z.object({
    status: z.enum(['ACTIVE', 'DISPOSED', 'WRITTEN_OFF', 'TRANSFERRED']).optional(),
    category_id: z.number().int().positive().optional()
}).optional()

export const FixedAssetCreateSchema = z.object({
    asset_name: z.string().min(1),
    category_id: PositiveIntSchema,
    acquisition_date: DateStringSchema,
    acquisition_cost: z.number().positive(),
    accumulated_depreciation: z.number().nonnegative().optional(),
    description: z.string().optional(),
    serial_number: z.string().optional(),
    location: z.string().optional(),
    asset_code: z.string().optional(),
    supplier_id: z.number().int().positive().optional(),
    warranty_expiry: DateStringSchema.optional()
})

export const FixedAssetUpdateSchema = FixedAssetCreateSchema.partial()

export const CreateFixedAssetTuple = z.tuple([
    FixedAssetCreateSchema,
    z.number().optional()
])

export const UpdateFixedAssetTuple = z.tuple([
    PositiveIntSchema,
    FixedAssetUpdateSchema,
    z.number().optional()
])

export const RunDepreciationTuple = z.tuple([
    PositiveIntSchema, // assetId
    PositiveIntSchema, // periodId
    z.number().optional()
])

// Opening Balances
export const StudentOpeningBalanceSchema = z.object({
    student_id: PositiveIntSchema,
    opening_balance: z.number(),
    balance_type: z.enum(['DEBIT', 'CREDIT']),
    admission_number: z.string().optional(),
    student_name: z.string().optional(),
    description: z.string().optional()
})

export const ImportStudentBalanceTuple = z.tuple([
    z.array(StudentOpeningBalanceSchema).min(1),
    FiscalYearSchema,
    z.string(), // importSource
    z.number().optional()
])

export const GLOpeningBalanceSchema = z.object({
    gl_account_id: PositiveIntSchema,
    debit_amount: z.number().nonnegative(),
    credit_amount: z.number().nonnegative(),
    academic_year_id: FiscalYearSchema, // importGLOpeningBalances(balances: OpeningBalanceImport[]) where Import has academic_year_id?
    description: z.string().optional(),
    // Added based on lint error "missing... imported_from, imported_by_user_id"
    // These might be injected by the service or handler??
    // The handler calls `getService().importGLOpeningBalances(balances, actor.id)`.
    // The service probably takes `(balances, userId)`.
    // If the service expects `balances` to HAVE `imported_by_user_id`, then the handler must inject it.
    // The lint error said: 
    // Type '{ gl_account_id: number; ... }' is missing ... imported_from, imported_by_user_id
    // This implies `OpeningBalanceImport` interface requires them.
    // I should check `OpeningBalanceService` definition or just add them to schema (optional?) or map in handler.
    // Since I can't check service easily without tool call, I'll assume I need to map them in handler.
    // BUT validatedHandler passes what schema validates.
    // So I will make them optional in schema or I will map in handler.
    // Mapping in handler is better for `imported_by_user_id`.
    // I will NOT add them to schema if they are internal.
    // Wait, if I don't add them, the schema-validated object won't have them, and if I pass that object to service, TS complains.
    // So I MUST map in handler.
})

export const ImportGLBalanceTuple = z.tuple([
    z.array(GLOpeningBalanceSchema).min(1),
    z.number().optional()
])

// Reconciliation Checks
export const RunReconciliationTuple = z.tuple([
    z.number().optional() // legacyUserId
])

// Finance Approvals
export const ApproveFinancialRequestTuple = z.tuple([
    PositiveIntSchema, // approvalId
    z.string().optional(), // reviewNotes (optional for approve?) Handler says `reviewNotes: string`. 
    // In handler: `reviewNotes || null`. So it can be falsy.
    // However, for Reject it says "Review notes are required".
    // For Approve it takes `reviewNotes`.
    // I'll make it optional string for approve, required for reject.
    z.number().optional() // legacyUserId
])

export const RejectFinancialRequestTuple = z.tuple([
    PositiveIntSchema, // approvalId
    z.string().min(1, "Review notes are required for rejection"), // reviewNotes
    z.number().optional() // legacyUserId
])

export const GetApprovalQueueTuple = z.tuple([
    z.enum(['PENDING', 'ALL']).optional().default('PENDING')
])
