import { getDatabase } from '../../database'

export interface HireClient {
    id: number
    client_name: string
    contact_phone?: string
    contact_email?: string
    organization?: string
    address?: string
    notes?: string
    is_active: number
    created_at: string
}

export interface HireAsset {
    id: number
    asset_name: string
    asset_type: 'VEHICLE' | 'FACILITY' | 'EQUIPMENT' | 'OTHER'
    registration_number?: string
    description?: string
    default_rate?: number
    rate_type?: 'PER_DAY' | 'PER_KM' | 'PER_HOUR' | 'FIXED'
    is_active: number
    created_at: string
}

export interface HireBooking {
    id: number
    booking_number: string
    asset_id: number
    client_id: number
    hire_date: string
    return_date?: string
    hire_start_time?: string
    hire_end_time?: string
    purpose?: string
    destination?: string
    distance_km?: number
    hours?: number
    total_amount: number
    amount_paid: number
    status: HireBookingStatus
    notes?: string
    recorded_by_user_id: number
    created_at: string
    // Joined fields
    asset_name?: string
    client_name?: string
    balance?: number
}

export interface HirePayment {
    id: number
    booking_id: number
    receipt_number: string
    amount: number
    payment_method: string
    payment_reference?: string
    payment_date: string
    notes?: string
    is_voided: number
    recorded_by_user_id: number
    created_at: string
}

export type HireBookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export class HireService {
    private readonly db = getDatabase()
    private static readonly ALLOWED_STATUS_TRANSITIONS: Record<HireBookingStatus, readonly HireBookingStatus[]> = {
        PENDING: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        CANCELLED: []
    }

    private isValidBookingStatus(status: string): status is HireBookingStatus {
        return ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)
    }

    private canTransitionStatus(from: HireBookingStatus, to: HireBookingStatus): boolean {
        return HireService.ALLOWED_STATUS_TRANSITIONS[from].includes(to)
    }

    // ========== CLIENTS ==========
    getClients(filters?: { search?: string; isActive?: boolean }): HireClient[] {
        let query = 'SELECT * FROM hire_client WHERE 1=1'
        const params: unknown[] = []

        if (filters?.search) {
            query += ' AND (client_name LIKE ? OR organization LIKE ? OR contact_phone LIKE ?)'
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`)
        }
        if (filters?.isActive !== undefined) {
            query += ' AND is_active = ?'
            params.push(filters.isActive ? 1 : 0)
        }
        query += ' ORDER BY client_name'
        return this.db.prepare(query).all(...params) as HireClient[]
    }

    getClientById(id: number): HireClient | undefined {
        return this.db.prepare('SELECT * FROM hire_client WHERE id = ?').get(id) as HireClient | undefined
    }

    createClient(data: Partial<HireClient>): { success: boolean; id?: number; errors?: string[] } {
        if (!data.client_name) {
            return { success: false, errors: ['Client name is required'] }
        }
        try {
            const result = this.db.prepare(`
                INSERT INTO hire_client (client_name, contact_phone, contact_email, organization, address, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(data.client_name, data.contact_phone, data.contact_email, data.organization, data.address, data.notes)
            return { success: true, id: Number(result.lastInsertRowid) }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create client'] }
        }
    }

    updateClient(id: number, data: Partial<HireClient>): { success: boolean; errors?: string[] } {
        try {
            this.db.prepare(`
                UPDATE hire_client SET 
                    client_name = COALESCE(?, client_name),
                    contact_phone = ?, contact_email = ?, organization = ?, 
                    address = ?, notes = ?, is_active = COALESCE(?, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                data.client_name, data.contact_phone, data.contact_email, data.organization,
                data.address, data.notes, data.is_active, id
            )
            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to update client'] }
        }
    }

    // ========== ASSETS ==========
    getAssets(filters?: { type?: string; isActive?: boolean }): HireAsset[] {
        let query = 'SELECT * FROM hire_asset WHERE 1=1'
        const params: unknown[] = []

        if (filters?.type) {
            query += ' AND asset_type = ?'
            params.push(filters.type)
        }
        if (filters?.isActive !== undefined) {
            query += ' AND is_active = ?'
            params.push(filters.isActive ? 1 : 0)
        }
        query += ' ORDER BY asset_name'
        return this.db.prepare(query).all(...params) as HireAsset[]
    }

    getAssetById(id: number): HireAsset | undefined {
        return this.db.prepare('SELECT * FROM hire_asset WHERE id = ?').get(id) as HireAsset | undefined
    }

    createAsset(data: Partial<HireAsset>): { success: boolean; id?: number; errors?: string[] } {
        if (!data.asset_name || !data.asset_type) {
            return { success: false, errors: ['Asset name and type are required'] }
        }
        try {
            const result = this.db.prepare(`
                INSERT INTO hire_asset (asset_name, asset_type, registration_number, description, default_rate, rate_type)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(data.asset_name, data.asset_type, data.registration_number, data.description, data.default_rate, data.rate_type)
            return { success: true, id: Number(result.lastInsertRowid) }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create asset'] }
        }
    }

    updateAsset(id: number, data: Partial<HireAsset>): { success: boolean; errors?: string[] } {
        try {
            this.db.prepare(`
                UPDATE hire_asset SET 
                    asset_name = COALESCE(?, asset_name), asset_type = COALESCE(?, asset_type),
                    registration_number = ?, description = ?, default_rate = ?, rate_type = ?,
                    is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                data.asset_name, data.asset_type, data.registration_number, data.description,
                data.default_rate, data.rate_type, data.is_active, id
            )
            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to update asset'] }
        }
    }

    // Check asset availability for a date range
    checkAssetAvailability(assetId: number, hireDate: string, returnDate?: string): boolean {
        const endDate = returnDate || hireDate
        const conflicts = this.db.prepare(`
            SELECT COUNT(*) as count FROM hire_booking 
            WHERE asset_id = ? 
            AND status NOT IN ('CANCELLED', 'COMPLETED')
            AND (
                (hire_date <= ? AND (return_date >= ? OR return_date IS NULL))
                OR (hire_date >= ? AND hire_date <= ?)
            )
        `).get(assetId, endDate, hireDate, hireDate, endDate) as { count: number }
        return conflicts.count === 0
    }

    // ========== BOOKINGS ==========
    getBookings(filters?: { status?: string; assetId?: number; clientId?: number; fromDate?: string; toDate?: string }): HireBooking[] {
        let query = `
            SELECT b.*, a.asset_name, c.client_name,
                   (b.total_amount - b.amount_paid) as balance
            FROM hire_booking b
            LEFT JOIN hire_asset a ON b.asset_id = a.id
            LEFT JOIN hire_client c ON b.client_id = c.id
            WHERE 1=1
        `
        const params: unknown[] = []

        if (filters?.status) {
            query += ' AND b.status = ?'
            params.push(filters.status)
        }
        if (filters?.assetId) {
            query += ' AND b.asset_id = ?'
            params.push(filters.assetId)
        }
        if (filters?.clientId) {
            query += ' AND b.client_id = ?'
            params.push(filters.clientId)
        }
        if (filters?.fromDate) {
            query += ' AND b.hire_date >= ?'
            params.push(filters.fromDate)
        }
        if (filters?.toDate) {
            query += ' AND b.hire_date <= ?'
            params.push(filters.toDate)
        }
        query += ' ORDER BY b.hire_date DESC'
        return this.db.prepare(query).all(...params) as HireBooking[]
    }

    getBookingById(id: number): HireBooking | undefined {
        return this.db.prepare(`
            SELECT b.*, a.asset_name, c.client_name,
                   (b.total_amount - b.amount_paid) as balance
            FROM hire_booking b
            LEFT JOIN hire_asset a ON b.asset_id = a.id
            LEFT JOIN hire_client c ON b.client_id = c.id
            WHERE b.id = ?
        `).get(id) as HireBooking | undefined
    }

    createBooking(data: Partial<HireBooking>, userId: number): { success: boolean; id?: number; booking_number?: string; errors?: string[] } {
        if (!data.asset_id || !data.client_id || !data.hire_date || !data.total_amount) {
            return { success: false, errors: ['Asset, client, hire date, and amount are required'] }
        }

        // Check availability
        if (!this.checkAssetAvailability(data.asset_id, data.hire_date, data.return_date)) {
            return { success: false, errors: ['Asset is not available for the selected dates'] }
        }

        try {
            const bookingNumber = `HB-${Date.now()}`
            const result = this.db.prepare(`
                INSERT INTO hire_booking (
                    booking_number, asset_id, client_id, hire_date, return_date,
                    hire_start_time, hire_end_time, purpose, destination, distance_km,
                    hours, total_amount, notes, recorded_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                bookingNumber, data.asset_id, data.client_id, data.hire_date, data.return_date,
                data.hire_start_time, data.hire_end_time, data.purpose, data.destination,
                data.distance_km, data.hours, data.total_amount, data.notes, userId
            )
            return { success: true, id: Number(result.lastInsertRowid), booking_number: bookingNumber }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create booking'] }
        }
    }

    updateBookingStatus(id: number, status: string): { success: boolean; errors?: string[] } {
        try {
            if (!this.isValidBookingStatus(status)) {
                return { success: false, errors: [`Invalid booking status: ${status}`] }
            }

            const booking = this.getBookingById(id)
            if (!booking) {
                return { success: false, errors: ['Booking not found'] }
            }

            if (booking.status === status) {
                return { success: true }
            }

            if (!this.canTransitionStatus(booking.status, status)) {
                return { success: false, errors: [`Invalid status transition: ${booking.status} -> ${status}`] }
            }

            if (status === 'COMPLETED' && booking.amount_paid < booking.total_amount) {
                return { success: false, errors: ['Cannot mark booking as completed before full payment'] }
            }

            const result = this.db.prepare(`
                UPDATE hire_booking
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = ?
            `).run(status, id, booking.status)

            if (result.changes === 0) {
                return { success: false, errors: ['Booking status was changed by another operation. Refresh and retry.'] }
            }
            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to update status'] }
        }
    }

    // ========== PAYMENTS ==========
    recordPayment(bookingId: number, data: Partial<HirePayment>, userId: number): { success: boolean; receipt_number?: string; errors?: string[] } {
        if (data.amount == null || !data.payment_method || !data.payment_date) {
            return { success: false, errors: ['Amount, payment method, and date are required'] }
        }

        const amount = data.amount

        const booking = this.getBookingById(bookingId)
        if (!booking) {
            return { success: false, errors: ['Booking not found'] }
        }

        const balance = booking.total_amount - booking.amount_paid
        if (amount > balance) {
            return { success: false, errors: ['Payment amount exceeds outstanding balance'] }
        }

        try {
            const receiptNumber = `HR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

            this.db.transaction(() => {
                // Insert payment
                this.db.prepare(`
                    INSERT INTO hire_payment (
                        booking_id, receipt_number, amount, payment_method, 
                        payment_reference, payment_date, notes, recorded_by_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    bookingId, receiptNumber, amount, data.payment_method,
                    data.payment_reference, data.payment_date, data.notes, userId
                )

                // Update booking amount_paid and potentially status
                const newAmountPaid = booking.amount_paid + amount
                const shouldComplete = newAmountPaid >= booking.total_amount
                    && this.canTransitionStatus(booking.status, 'COMPLETED')

                this.db.prepare(`
                    UPDATE hire_booking 
                    SET amount_paid = ?, status = CASE WHEN ? >= total_amount THEN 'COMPLETED' ELSE status END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(newAmountPaid, shouldComplete ? newAmountPaid : 0, bookingId)

                // Record income in ledger
                const catId = this.db.prepare(`SELECT id FROM transaction_category WHERE category_name = 'Other Income' LIMIT 1`).get() as { id: number } | undefined
                this.db.prepare(`
                    INSERT INTO ledger_transaction (
                        transaction_ref, amount, payment_method, payment_reference, 
                        transaction_date, transaction_type, category_id, debit_credit,
                        description, recorded_by_user_id
                    ) VALUES (?, ?, ?, ?, ?, 'INCOME', ?, 'CREDIT', ?, ?)
                `).run(
                    receiptNumber, amount, data.payment_method, data.payment_reference,
                    data.payment_date, catId?.id || 1, `Asset Hire: ${booking.asset_name}`, userId
                )
            })()

            return { success: true, receipt_number: receiptNumber }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to record payment'] }
        }
    }

    getPaymentsByBooking(bookingId: number): HirePayment[] {
        return this.db.prepare('SELECT * FROM hire_payment WHERE booking_id = ? AND is_voided = 0 ORDER BY payment_date DESC')
            .all(bookingId) as HirePayment[]
    }

    // ========== STATISTICS ==========
    getHireStats(): { totalBookings: number; totalIncome: number; pendingAmount: number; thisMonth: number } {
        const stats = this.db.prepare(`
            SELECT 
                COUNT(*) as totalBookings,
                COALESCE(SUM(amount_paid), 0) as totalIncome,
                COALESCE(SUM(total_amount - amount_paid), 0) as pendingAmount,
                (SELECT COALESCE(SUM(amount_paid), 0) FROM hire_booking 
                 WHERE strftime('%Y-%m', hire_date) = strftime('%Y-%m', 'now')) as thisMonth
            FROM hire_booking WHERE status != 'CANCELLED'
        `).get() as { totalBookings: number; totalIncome: number; pendingAmount: number; thisMonth: number }
        return stats
    }
}
