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
    status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    notes?: string
    recorded_by_user_id: number
    created_at: string
    asset_name?: string
    client_name?: string
    balance?: number
}

export type HireBookingStatus = HireBooking['status']

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

export interface HireStats {
    totalBookings: number
    totalIncome: number
    pendingAmount: number
    thisMonth: number
}

export interface HireAPI {
    // Clients
    getHireClients: (filters?: { search?: string; isActive?: boolean }) => Promise<HireClient[]>
    getHireClientById: (id: number) => Promise<HireClient | undefined>
    createHireClient: (data: Partial<HireClient>) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    updateHireClient: (id: number, data: Partial<HireClient>) => Promise<{ success: boolean; errors?: string[] }>

    // Assets
    getHireAssets: (filters?: { type?: string; isActive?: boolean }) => Promise<HireAsset[]>
    getHireAssetById: (id: number) => Promise<HireAsset | undefined>
    createHireAsset: (data: Partial<HireAsset>) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    updateHireAsset: (id: number, data: Partial<HireAsset>) => Promise<{ success: boolean; errors?: string[] }>
    checkHireAvailability: (assetId: number, hireDate: string, returnDate?: string) => Promise<boolean>

    // Bookings
    getHireBookings: (filters?: { status?: string; assetId?: number; clientId?: number; fromDate?: string; toDate?: string }) => Promise<HireBooking[]>
    getHireBookingById: (id: number) => Promise<HireBooking | undefined>
    createHireBooking: (data: Partial<HireBooking>) => Promise<{ success: boolean; id?: number; booking_number?: string; errors?: string[] }>
    updateHireBookingStatus: (id: number, status: HireBookingStatus) => Promise<{ success: boolean; errors?: string[] }>

    // Payments
    recordHirePayment: (bookingId: number, data: Partial<HirePayment>) => Promise<{ success: boolean; receipt_number?: string; errors?: string[] }>
    getHirePaymentsByBooking: (bookingId: number) => Promise<HirePayment[]>

    // Stats
    getHireStats: () => Promise<HireStats>
}
