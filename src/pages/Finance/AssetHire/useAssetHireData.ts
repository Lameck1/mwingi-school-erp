import { useState, useCallback } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type HireBooking, type HireAsset, type HireClient, type HireStats } from '../../../types/electron-api/HireAPI'
import { centsToShillings, numberToWords, shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'
import { printDocument } from '../../../utils/print'

type TabType = 'bookings' | 'clients' | 'assets'

const getTodayDate = () => new Date().toISOString().split('T')[0] ?? ''

function buildPaymentForm(balanceCents?: number) {
    return {
        amount: balanceCents === undefined ? '' : String(centsToShillings(balanceCents)),
        payment_method: 'CASH',
        payment_reference: '',
        payment_date: getTodayDate(),
    }
}

const INITIAL_BOOKING_FORM = {
    asset_id: 0,
    client_id: 0,
    hire_date: getTodayDate(),
    return_date: '',
    purpose: '',
    destination: '',
    distance_km: '',
    total_amount: '',
}

const INITIAL_CLIENT_FORM = {
    client_name: '',
    contact_phone: '',
    contact_email: '',
    organization: '',
    address: '',
    notes: '',
}

export type BookingForm = typeof INITIAL_BOOKING_FORM
export type ClientForm = typeof INITIAL_CLIENT_FORM
export type PaymentForm = ReturnType<typeof buildPaymentForm>

export function useAssetHireData() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    const [activeTab, setActiveTab] = useState<TabType>('bookings')
    const [bookings, setBookings] = useState<HireBooking[]>([])
    const [clients, setClients] = useState<HireClient[]>([])
    const [assets, setAssets] = useState<HireAsset[]>([])
    const [stats, setStats] = useState<HireStats | null>(null)
    const [loading, setLoading] = useState(true)

    const [showBookingModal, setShowBookingModal] = useState(false)
    const [showClientModal, setShowClientModal] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedBooking, setSelectedBooking] = useState<HireBooking | null>(null)

    const [statusFilter, setStatusFilter] = useState('')
    const [searchQuery, setSearchQuery] = useState('')

    const [bookingForm, setBookingForm] = useState(INITIAL_BOOKING_FORM)
    const [clientForm, setClientForm] = useState(INITIAL_CLIENT_FORM)
    const [paymentForm, setPaymentForm] = useState(buildPaymentForm())

    // ── Data loading ──────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [bookingsRes, clientsRes, assetsRes, statsRes] = await Promise.all([
                globalThis.electronAPI.finance.getHireBookings(),
                globalThis.electronAPI.finance.getHireClients(),
                globalThis.electronAPI.finance.getHireAssets({ isActive: true }),
                globalThis.electronAPI.finance.getHireStats(),
            ])
            setBookings(unwrapArrayResult(bookingsRes, 'Failed to load hire bookings'))
            setClients(unwrapArrayResult(clientsRes, 'Failed to load hire clients'))
            setAssets(unwrapArrayResult(assetsRes, 'Failed to load hire assets'))
            setStats(unwrapIPCResult<HireStats>(statsRes, 'Failed to load hire statistics'))
        } catch (error) {
            console.error('Failed to load hire data:', error)
            setBookings([])
            setClients([])
            setAssets([])
            setStats(null)
            showToast(error instanceof Error ? error.message : 'Failed to load hire data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    // ── Derived data ──────────────────────────────────────────

    const filteredBookings = bookings.filter((b) => {
        const matchesStatus = !statusFilter || b.status === statusFilter
        const matchesSearch =
            !searchQuery ||
            b.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.booking_number.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesStatus && matchesSearch
    })

    const filteredClients = clients.filter(
        (c) => !searchQuery || c.client_name.toLowerCase().includes(searchQuery.toLowerCase()),
    )

    // ── Modal helpers ─────────────────────────────────────────

    const closePaymentModal = () => {
        setShowPaymentModal(false)
        setSelectedBooking(null)
        setPaymentForm(buildPaymentForm())
    }

    const openPaymentModal = (booking: HireBooking) => {
        setSelectedBooking(booking)
        setPaymentForm(buildPaymentForm(booking.balance || 0))
        setShowPaymentModal(true)
    }

    // ── CRUD handlers ─────────────────────────────────────────

    const handleCreateBooking = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!user) {
            showToast('User not authenticated', 'error')
            return
        }
        if (!bookingForm.asset_id || !bookingForm.client_id || !bookingForm.total_amount) {
            showToast('Please fill in all required fields', 'warning')
            return
        }

        try {
            const available = unwrapIPCResult(
                await globalThis.electronAPI.finance.checkHireAvailability(
                    bookingForm.asset_id,
                    bookingForm.hire_date,
                    bookingForm.return_date || undefined,
                ),
                'Failed to verify asset availability',
            )
            if (!available) {
                showToast('Asset is not available for the selected dates', 'warning')
                return
            }

            const result = await globalThis.electronAPI.finance.createHireBooking(
                {
                    ...bookingForm,
                    distance_km: bookingForm.distance_km ? Number.parseFloat(bookingForm.distance_km) : undefined,
                    total_amount: shillingsToCents(bookingForm.total_amount),
                } as Parameters<typeof globalThis.electronAPI.finance.createHireBooking>[0],
                user.id,
            )

            if (result.success) {
                showToast(`Booking created: ${result.booking_number || 'N/A'}`, 'success')
                setShowBookingModal(false)
                setBookingForm({ ...INITIAL_BOOKING_FORM, hire_date: getTodayDate() })
                void loadData()
                return
            }
            showToast(result.errors?.[0] || 'Failed to create booking', 'error')
        } catch (error) {
            console.error('Failed to create booking:', error)
            showToast(error instanceof Error ? error.message : 'Failed to create booking', 'error')
        }
    }

    const handleCreateClient = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            const result = await globalThis.electronAPI.finance.createHireClient(clientForm)
            if (result.success) {
                showToast('Client created successfully', 'success')
                setShowClientModal(false)
                setClientForm(INITIAL_CLIENT_FORM)
                void loadData()
                return
            }
            showToast(result.errors?.[0] || 'Failed to create client', 'error')
        } catch (error) {
            console.error('Failed to create client:', error)
            showToast(error instanceof Error ? error.message : 'Failed to create client', 'error')
        }
    }

    const handleRecordPayment = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!user || !selectedBooking) {
            showToast('Select a booking before recording payment', 'warning')
            return
        }
        try {
            const result = await globalThis.electronAPI.finance.recordHirePayment(
                selectedBooking.id,
                {
                    ...paymentForm,
                    amount: shillingsToCents(paymentForm.amount),
                } as Parameters<typeof globalThis.electronAPI.finance.recordHirePayment>[1],
                user.id,
            )
            if (result.success) {
                showToast(`Payment recorded: ${result.receipt_number || 'receipt issued'}`, 'success')
                closePaymentModal()
                void loadData()
                return
            }
            showToast(result.errors?.[0] || 'Failed to record payment', 'error')
        } catch (error) {
            console.error('Failed to record payment:', error)
            showToast(error instanceof Error ? error.message : 'Failed to record payment', 'error')
        }
    }

    const handleUpdateStatus = async (
        bookingId: number,
        status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED',
    ) => {
        try {
            const result = await globalThis.electronAPI.finance.updateHireBookingStatus(bookingId, status)
            if (result.success) {
                void loadData()
                return
            }
            showToast(result.errors?.[0] || 'Failed to update booking status', 'error')
        } catch (error) {
            console.error('Failed to update booking status:', error)
            showToast(error instanceof Error ? error.message : 'Failed to update booking status', 'error')
        }
    }

    const handlePrintReceipt = async (booking: HireBooking) => {
        try {
            const payments = unwrapArrayResult(
                await globalThis.electronAPI.finance.getHirePaymentsByBooking(booking.id),
                'Failed to load booking payments',
            )
            const latestPayment = payments[0]
            if (!latestPayment) {
                showToast('No payments available to print', 'warning')
                return
            }

            const settings = unwrapIPCResult(
                await globalThis.electronAPI.settings.getSchoolSettings(),
                'Failed to load school settings',
            )
            printDocument({
                title: `Hire Receipt - ${latestPayment.receipt_number}`,
                template: 'receipt',
                data: {
                    receiptNumber: latestPayment.receipt_number,
                    date: latestPayment.payment_date,
                    amount: latestPayment.amount,
                    paymentMode: latestPayment.payment_method,
                    reference: latestPayment.payment_reference,
                    studentName: booking.client_name,
                    admissionNumber: booking.booking_number,
                    description: `Asset Hire: ${booking.asset_name}`,
                    amountInWords: `${numberToWords(Math.floor(latestPayment.amount / 100))} Shillings Only`,
                },
                schoolSettings: settings ? (settings as Record<string, unknown>) : {},
            })
        } catch (error) {
            console.error('Failed to print hire receipt:', error)
            showToast(error instanceof Error ? error.message : 'Failed to print receipt', 'error')
        }
    }

    return {
        // Tab & filters
        activeTab,
        setActiveTab,
        statusFilter,
        setStatusFilter,
        searchQuery,
        setSearchQuery,

        // Data
        loading,
        loadData,
        stats,
        assets,
        filteredBookings,
        filteredClients,

        // Booking modal
        showBookingModal,
        setShowBookingModal,
        bookingForm,
        setBookingForm,
        handleCreateBooking,

        // Client modal
        showClientModal,
        setShowClientModal,
        clientForm,
        setClientForm,
        handleCreateClient,

        // Payment modal
        showPaymentModal,
        selectedBooking,
        paymentForm,
        setPaymentForm,
        openPaymentModal,
        closePaymentModal,
        handleRecordPayment,

        // Actions
        handleUpdateStatus,
        handlePrintReceipt,
    } as const
}
