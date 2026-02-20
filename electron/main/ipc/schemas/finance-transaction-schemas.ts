import { z } from 'zod'

import { DateStringSchema, PositiveIntSchema, FiscalYearSchema } from './finance-schemas'

// Shared
const AmountSchema = z.number().positive() // cents? usually
const _DescriptionSchema = z.string().optional()

// Invoice
export const InvoiceItemSchema = z.object({
    fee_category_id: PositiveIntSchema,
    amount: AmountSchema,
    description: z.string().optional()
})

export const InvoiceDataSchema = z.object({
    student_id: PositiveIntSchema,
    term_id: PositiveIntSchema,
    invoice_date: DateStringSchema,
    due_date: DateStringSchema
}).refine(data => data.due_date >= data.invoice_date, { message: "Due date cannot be earlier than invoice date", path: ['due_date'] })

export const CreateInvoiceTuple = z.tuple([
    InvoiceDataSchema,
    z.array(InvoiceItemSchema).min(1),
    z.number().optional() // legacyUserId
])

// Fee Structure
export const FeeCategoryTuple = z.tuple([
    z.string().min(1), // name
    z.string(), // description
    z.number().optional() // legacyUserId
])

export const GetFeeStructureTuple = z.tuple([
    FiscalYearSchema, // academicYearId
    PositiveIntSchema // termId
])

export const FeeStructureItemSchema = z.object({
    stream_id: PositiveIntSchema,
    fee_category_id: PositiveIntSchema,
    amount: AmountSchema,
    student_type: z.enum(['BOARDER', 'DAY_SCHOLAR'])
})

export const SaveFeeStructureTuple = z.tuple([
    z.array(FeeStructureItemSchema).min(1),
    FiscalYearSchema,
    PositiveIntSchema, // termId
    z.number().optional()
])

// Invoice Generation
export const GenerateBatchTuple = z.tuple([
    FiscalYearSchema,
    PositiveIntSchema,
    z.number().optional()
])

export const GenerateStudentInvoiceTuple = z.tuple([
    PositiveIntSchema, // studentId
    FiscalYearSchema,
    PositiveIntSchema,
    z.number().optional()
])

// Payment
export const PaymentDataSchema = z.object({
    student_id: PositiveIntSchema,
    amount: AmountSchema,
    transaction_date: DateStringSchema,
    payment_method: z.string().min(1), // e.g. CASH, MPESA
    payment_reference: z.string().optional(),
    description: z.string().optional(),
    invoice_id: PositiveIntSchema.optional(),
    term_id: z.number().optional(),
    amount_in_words: z.string().optional(),
    idempotency_key: z.string().optional()
})

export const RecordPaymentTuple = z.tuple([
    PaymentDataSchema,
    z.number().optional()
])

export const PayWithCreditDataSchema = z.object({
    studentId: PositiveIntSchema,
    invoiceId: PositiveIntSchema,
    amount: AmountSchema
})

export const PayWithCreditTuple = z.tuple([
    PayWithCreditDataSchema,
    z.number().optional()
])

export const VoidPaymentTuple = z.tuple([
    PositiveIntSchema, // transactionId
    z.string().min(1), // reason
    z.number().optional(), // legacyUserId
    z.string().optional() // recoveryMethod
])

// Receipt
export const ReceiptByTransactionTuple = z.tuple([PositiveIntSchema]) // transactionId

// Credits
export const AddCreditTuple = z.tuple([
    PositiveIntSchema, // studentId
    AmountSchema,
    z.string().min(1), // notes
    z.number().optional() // legacyUserId
])

export const AllocateCreditsTuple = z.tuple([
    PositiveIntSchema, // studentId
    z.number().optional()
])

// Proration
export const CalculateProratedFeeTuple = z.tuple([
    AmountSchema,
    DateStringSchema, // termStart
    DateStringSchema, // termEnd
    DateStringSchema // enrollment
])

export const GenerateProratedInvoiceTuple = z.tuple([
    PositiveIntSchema, // studentId
    PositiveIntSchema, // templateInvoiceId
    DateStringSchema, // enrollmentDate
    z.number().optional()
])

// Scholarship
export const ScholarshipDataSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    amount: AmountSchema,
    fund_id: PositiveIntSchema
}) // Partial assumption

export const CreateScholarshipTuple = z.tuple([
    ScholarshipDataSchema,
    z.number().optional()
])

export const ScholarshipAllocationSchema = z.object({
    scholarship_id: PositiveIntSchema,
    student_id: PositiveIntSchema,
    term_id: PositiveIntSchema,
    amount: AmountSchema
})

export const AllocateScholarshipTuple = z.tuple([
    ScholarshipAllocationSchema,
    z.number().optional()
])

export const ApplyScholarshipTuple = z.tuple([
    PositiveIntSchema, // studentScholarshipId
    PositiveIntSchema, // invoiceId
    AmountSchema,
    z.number().optional()
])

export const ValidateEligibilityTuple = z.tuple([
    PositiveIntSchema, // studentId
    PositiveIntSchema // scholarshipId
])
