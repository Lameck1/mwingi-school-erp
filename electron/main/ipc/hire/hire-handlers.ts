import { container } from '../../services/base/ServiceContainer'
import { validateDate, validateId } from '../../utils/validation'
import { safeHandleRawWithRole, ROLES } from '../ipc-result'

// Local interfaces to avoid importing from src/ which is not in electron tsconfig
interface HireClient {
    id: number; client_name: string; contact_phone?: string; contact_email?: string; is_active: number;
}
interface HireAsset {
    id: number; asset_name: string; asset_type: 'VEHICLE' | 'FACILITY' | 'EQUIPMENT' | 'OTHER'; default_rate?: number; is_active: number;
}
interface HireBooking {
    id: number; asset_id: number; client_id: number; hire_date: string; total_amount: number; status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    return_date?: string;
}
interface HirePayment {
    id: number; booking_id: number; amount: number; payment_date: string;
}

const ALLOWED_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const

const svc = () => container.resolve('HireService')

export function registerHireHandlers(): void {
    // ========== CLIENTS ==========
    safeHandleRawWithRole('hire:getClients', ROLES.STAFF, (_event, filters?: { search?: string; isActive?: boolean }) => {
        return svc().getClients(filters)
    })

    safeHandleRawWithRole('hire:getClientById', ROLES.STAFF, (_event, id: number) => {
        const v = validateId(id, 'Client ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().getClientById(v.data!)
    })

    safeHandleRawWithRole('hire:createClient', ROLES.FINANCE, (_event, data: Partial<HireClient>) => {
        return svc().createClient(data)
    })

    safeHandleRawWithRole('hire:updateClient', ROLES.FINANCE, (_event, id: number, data: Partial<HireClient>) => {
        const v = validateId(id, 'Client ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().updateClient(v.data!, data)
    })

    // ========== ASSETS ==========
    safeHandleRawWithRole('hire:getAssets', ROLES.STAFF, (_event, filters?: { type?: string; isActive?: boolean }) => {
        return svc().getAssets(filters)
    })

    safeHandleRawWithRole('hire:getAssetById', ROLES.STAFF, (_event, id: number) => {
        const v = validateId(id, 'Asset ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().getAssetById(v.data!)
    })

    safeHandleRawWithRole('hire:createAsset', ROLES.FINANCE, (_event, data: Partial<HireAsset>) => {
        return svc().createAsset(data)
    })

    safeHandleRawWithRole('hire:updateAsset', ROLES.FINANCE, (_event, id: number, data: Partial<HireAsset>) => {
        const v = validateId(id, 'Asset ID')
        if (!v.success) { return { success: false, error: v.error } }
        return svc().updateAsset(v.data!, data)
    })

    safeHandleRawWithRole('hire:checkAvailability', ROLES.STAFF, (_event, assetId: number, hireDate: string, returnDate?: string) => {
        return svc().checkAssetAvailability(assetId, hireDate, returnDate)
    })

    // ========== BOOKINGS ==========
    safeHandleRawWithRole('hire:getBookings', ROLES.STAFF, (_event, filters?: { status?: string; assetId?: number; clientId?: number }) => {
        return svc().getBookings(filters)
    })

    safeHandleRawWithRole('hire:getBookingById', ROLES.STAFF, (_event, id: number) => {
        return svc().getBookingById(id)
    })

    safeHandleRawWithRole('hire:createBooking', ROLES.FINANCE, (_event, data: Partial<HireBooking>, userId: number) => {
        const vUser = validateId(userId, 'User ID')
        if (!vUser.success) { return { success: false, error: vUser.error } }
        const vAsset = validateId(data.asset_id, 'Asset ID')
        if (!vAsset.success) { return { success: false, error: vAsset.error } }
        const vClient = validateId(data.client_id, 'Client ID')
        if (!vClient.success) { return { success: false, error: vClient.error } }
        const vHireDate = validateDate(data.hire_date)
        if (!vHireDate.success) { return { success: false, error: vHireDate.error } }
        if (data.return_date) {
            const vReturnDate = validateDate(data.return_date)
            if (!vReturnDate.success) { return { success: false, error: vReturnDate.error } }
            if (vReturnDate.data! < vHireDate.data!) {
                return { success: false, error: 'Return date cannot be earlier than hire date' }
            }
        }
        if (!Number.isFinite(data.total_amount) || (data.total_amount || 0) <= 0) {
            return { success: false, error: 'Booking amount must be greater than zero' }
        }

        return svc().createBooking(data, userId)
    })

    safeHandleRawWithRole('hire:updateBookingStatus', ROLES.FINANCE, (_event, id: number, status: string) => {
        const v = validateId(id, 'Booking ID')
        if (!v.success) { return { success: false, error: v.error } }
        if (!ALLOWED_BOOKING_STATUSES.includes(status as (typeof ALLOWED_BOOKING_STATUSES)[number])) {
            return { success: false, error: `Invalid booking status: ${status}` }
        }
        return svc().updateBookingStatus(v.data!, status)
    })

    // ========== PAYMENTS ==========
    safeHandleRawWithRole('hire:recordPayment', ROLES.FINANCE, (_event, bookingId: number, data: Partial<HirePayment>, userId: number) => {
        const vBooking = validateId(bookingId, 'Booking ID')
        const vUser = validateId(userId, 'User ID')
        if (!vBooking.success) { return { success: false, error: vBooking.error } }
        if (!vUser.success) { return { success: false, error: vUser.error } }
        return svc().recordPayment(vBooking.data!, data, vUser.data!)
    })

    safeHandleRawWithRole('hire:getPaymentsByBooking', ROLES.STAFF, (_event, bookingId: number) => {
        return svc().getPaymentsByBooking(bookingId)
    })

    // ========== STATS ==========
    safeHandleRawWithRole('hire:getStats', ROLES.STAFF, () => {
        return svc().getHireStats()
    })
}
