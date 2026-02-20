import { z } from 'zod'

// Shared schemas
const ActiveFlagSchema = z.union([z.literal(0), z.literal(1)]).optional()

// Client Schemas
export const ClientFilterSchema = z.object({
    search: z.string().optional(),
    isActive: z.boolean().optional()
}).optional()

export const HireClientSchema = z.object({
    client_name: z.string().min(1).optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email().optional().or(z.literal('')),
    is_active: ActiveFlagSchema
})
// For create/update, partial is used in handler. 
// But create usually requires name. Handler uses Partial<HireClient>.
// I'll make strict schemas if possible, but to match existing loose types, z.object().partial() might be needed or specific create schema.
// Let's use the object above which has optional fields, maybe strict for create?
// Original: `data: Partial<HireClient>`
// I'll define `HireClientUpdateSchema` which is all optional.
export const HireClientUpdateSchema = z.object({
    client_name: z.string().min(1).optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email().optional().or(z.literal('')),
    is_active: ActiveFlagSchema
})

// Asset Schemas
export const AssetFilterSchema = z.object({
    type: z.string().optional(),
    isActive: z.boolean().optional()
}).optional()

export const HireAssetSchema = z.object({
    asset_name: z.string().min(1).optional(),
    asset_type: z.enum(['VEHICLE', 'FACILITY', 'EQUIPMENT', 'OTHER']).optional(),
    default_rate: z.number().nonnegative().optional(),
    is_active: ActiveFlagSchema
})

export const CheckAvailabilityTuple = z.tuple([
    z.number().int().positive(), // assetId
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD'), // hireDate
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD').optional() // returnDate
])

// Booking Schemas
export const BookingFilterSchema = z.object({
    status: z.string().optional(),
    assetId: z.number().int().positive().optional(),
    clientId: z.number().int().positive().optional()
}).optional()

const BookingStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])

export const HireBookingSchema = z.object({
    asset_id: z.number().int().positive(),
    client_id: z.number().int().positive(),
    hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    total_amount: z.number().positive(),
    status: BookingStatusSchema.default('PENDING').optional()
}).refine(data => {
    if (data.return_date && data.hire_date) {
        return data.return_date >= data.hire_date
    }
    return true
}, { message: "Return date cannot be earlier than hire date", path: ['return_date'] })

export const UpdateBookingStatusTuple = z.tuple([
    z.number().int().positive(),
    z.string().refine(val => ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(val), "Invalid booking status")
])

// Payment Schemas
export const HirePaymentSchema = z.object({
    amount: z.number().positive(),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export const RecordPaymentTuple = z.tuple([
    z.number().int().positive(), // bookingId
    HirePaymentSchema,
    z.number().optional() // legacyUserId
])

export const CreateBookingTuple = z.tuple([
    HireBookingSchema,
    z.number().optional() // legacyUserId
])
