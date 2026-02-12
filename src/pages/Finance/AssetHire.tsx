import React, { useState, useEffect } from 'react'

import { useAuthStore } from '../../stores'
import { type HireBooking, type HireAsset, type HireClient, type HireStats } from '../../types/electron-api/HireAPI'
import { formatCurrencyFromCents, shillingsToCents, centsToShillings } from '../../utils/format'
import { printDocument } from '../../utils/print'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

type TabType = 'bookings' | 'clients' | 'assets'

const getStatusColor = (status: string) => {
    switch (status) {
        case 'PENDING': return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
        case 'CONFIRMED': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
        case 'IN_PROGRESS': return 'bg-purple-100 text-purple-800'
        case 'COMPLETED': return 'bg-green-500/15 text-green-600 dark:text-green-400'
        case 'CANCELLED': return 'bg-red-500/15 text-red-600 dark:text-red-400'
        default: return 'bg-secondary text-foreground'
    }
}

export default function AssetHire() {
    const { user } = useAuthStore()
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

    // Booking form state
    const [bookingForm, setBookingForm] = useState({
        asset_id: 0,
        client_id: 0,
        hire_date: new Date().toISOString().split('T')[0],
        return_date: '',
        purpose: '',
        destination: '',
        distance_km: '',
        total_amount: ''
    })

    // Client form state
    const [clientForm, setClientForm] = useState({
        client_name: '',
        contact_phone: '',
        contact_email: '',
        organization: '',
        address: '',
        notes: ''
    })

    // Payment form state
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        payment_method: 'CASH',
        payment_reference: '',
        payment_date: new Date().toISOString().split('T')[0]
    })

    useEffect(() => {
        void loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [bookingsRes, clientsRes, assetsRes, statsRes] = await Promise.all([
                globalThis.electronAPI.getHireBookings(),
                globalThis.electronAPI.getHireClients(),
                globalThis.electronAPI.getHireAssets({ isActive: true }),
                globalThis.electronAPI.getHireStats()
            ])
            setBookings(bookingsRes)
            setClients(clientsRes)
            setAssets(assetsRes)
            setStats(statsRes)
        } catch (error) {
            console.error('Failed to load hire data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateBooking = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) {return}

        // Validate
        if (!bookingForm.asset_id || !bookingForm.client_id || !bookingForm.total_amount) {
            alert('Please fill in all required fields')
            return
        }

        // Check availability
        const available = await globalThis.electronAPI.checkHireAvailability(
            bookingForm.asset_id,
            bookingForm.hire_date,
            bookingForm.return_date || undefined
        )
        if (!available) {
            alert('Asset is not available for the selected dates')
            return
        }

        const result = await globalThis.electronAPI.createHireBooking({
            ...bookingForm,
            distance_km: bookingForm.distance_km ? Number.parseFloat(bookingForm.distance_km) : undefined,
            total_amount: shillingsToCents(bookingForm.total_amount)
        }, user.id)

        if (result.success) {
            alert(`Booking created! Number: ${result.booking_number}`)
            setShowBookingModal(false)
            setBookingForm({
                asset_id: 0, client_id: 0, hire_date: new Date().toISOString().split('T')[0],
                return_date: '', purpose: '', destination: '', distance_km: '', total_amount: ''
            })
            void loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = await globalThis.electronAPI.createHireClient(clientForm)
        if (result.success) {
            alert('Client created successfully!')
            setShowClientModal(false)
            setClientForm({ client_name: '', contact_phone: '', contact_email: '', organization: '', address: '', notes: '' })
            void loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !selectedBooking) {return}

        const result = await globalThis.electronAPI.recordHirePayment(
            selectedBooking.id,
            {
                ...paymentForm,
                amount: shillingsToCents(paymentForm.amount)
            },
            user.id
        )

        if (result.success) {
            alert(`Payment recorded! Receipt: ${result.receipt_number}`)
            setShowPaymentModal(false)
            setPaymentForm({ amount: '', payment_method: 'CASH', payment_reference: '', payment_date: new Date().toISOString().split('T')[0] })
            setSelectedBooking(null)
            void loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleUpdateStatus = async (bookingId: number, status: string) => {
        const result = await globalThis.electronAPI.updateHireBookingStatus(bookingId, status)
        if (result.success) {
            void loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handlePrintReceipt = async (booking: HireBooking) => {
        const payments = await globalThis.electronAPI.getHirePaymentsByBooking(booking.id)
        const latestPayment = payments[0]
        if (!latestPayment) {
            alert('No payments to print')
            return
        }

        const settings = await globalThis.electronAPI.getSchoolSettings()
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
                amountInWords: `${numberToWords(Math.floor(latestPayment.amount / 100))} Shillings Only`
            },
            schoolSettings: settings ? (settings as unknown as Record<string, unknown>) : {}
        })
    }

    const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

        if (num === 0) {return 'Zero'}
        if (num < 20) {return ones[num]}
        if (num < 100) {return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '')}
        if (num < 1000) {return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '')}
        if (num < 1000000) {return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '')}
        return numberToWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '')
    }

    const filteredBookings = bookings.filter(b => {
        const matchesStatus = !statusFilter || b.status === statusFilter
        const matchesSearch = !searchQuery ||
            b.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.booking_number.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesStatus && matchesSearch
    })

    const filteredClients = clients.filter(c =>
        !searchQuery || c.client_name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return <div className="p-6 text-center">Loading...</div>
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Asset Hire' }]} />
                    <h1 className="text-2xl font-bold text-foreground">Asset Hire Management</h1>
                    <p className="text-muted-foreground">Manage bus and asset rentals</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowClientModal(true)}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
                    >
                        + New Client
                    </button>
                    <button
                        onClick={() => setShowBookingModal(true)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80"
                    >
                        + New Booking
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-blue-500">
                        <div className="text-sm text-muted-foreground">Total Bookings</div>
                        <div className="text-2xl font-bold">{stats.totalBookings}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-green-500">
                        <div className="text-sm text-muted-foreground">Total Income</div>
                        <div className="text-2xl font-bold">{formatCurrencyFromCents(stats.totalIncome)}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-orange-500">
                        <div className="text-sm text-muted-foreground">Pending Amount</div>
                        <div className="text-2xl font-bold">{formatCurrencyFromCents(stats.pendingAmount)}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-purple-500">
                        <div className="text-sm text-muted-foreground">This Month</div>
                        <div className="text-2xl font-bold">{formatCurrencyFromCents(stats.thisMonth)}</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border">
                <nav className="flex space-x-8">
                    {(['bookings', 'clients', 'assets'] as TabType[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground/70'
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-4 py-2 border border-border rounded-lg w-full sm:w-64 bg-input text-foreground"
                />
                {activeTab === 'bookings' && (
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-border rounded-lg bg-input text-foreground"
                        aria-label="Filter by status"
                    >
                        <option value="">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                )}
            </div>

            {/* Content */}
            <div className="bg-card rounded-lg shadow overflow-hidden">
                {activeTab === 'bookings' && (
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Booking #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Asset</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Balance</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                            {filteredBookings.map(booking => (
                                <tr key={booking.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{booking.booking_number}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.client_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.asset_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(booking.hire_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{formatCurrencyFromCents(booking.total_amount)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                                        {formatCurrencyFromCents(booking.balance || 0)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(booking.status)}`}>
                                            {booking.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                                        {booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED' && (
                                            <>
                                                <button
                                                    onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); setPaymentForm({ ...paymentForm, amount: String(centsToShillings(booking.balance || 0)) }) }}
                                                    className="text-success hover:text-success/80"
                                                >
                                                    Pay
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateStatus(booking.id, 'CANCELLED')}
                                                    className="text-destructive hover:text-destructive/80"
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                        {booking.amount_paid > 0 && (
                                            <button
                                                onClick={() => handlePrintReceipt(booking)}
                                                className="text-primary hover:text-primary/80"
                                            >
                                                Print
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredBookings.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                                        No bookings found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {activeTab === 'clients' && (
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Organization</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                            {filteredClients.map(client => (
                                <tr key={client.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{client.client_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{client.organization || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{client.contact_phone || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{client.contact_email || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === 'assets' && (
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Asset Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Default Rate</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Rate Type</th>
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                            {assets.map(asset => (
                                <tr key={asset.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{asset.asset_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.asset_type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{formatCurrencyFromCents(asset.default_rate || 0)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.rate_type || 'MANUAL'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* New Booking Modal */}
            {showBookingModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">New Booking</h2>
                        <form onSubmit={handleCreateBooking} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-448" className="block text-sm font-medium mb-1">Asset *</label>
                                    <select id="field-448"
                                        value={bookingForm.asset_id}
                                        onChange={(e) => setBookingForm({ ...bookingForm, asset_id: Number.parseInt(e.target.value, 10) })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        required
                                        aria-label="Select asset"
                                    >
                                        <option value="">Select Asset</option>
                                        {assets.map(a => (
                                            <option key={a.id} value={a.id}>{a.asset_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="field-463" className="block text-sm font-medium mb-1">Client *</label>
                                    <select id="field-463"
                                        value={bookingForm.client_id}
                                        onChange={(e) => setBookingForm({ ...bookingForm, client_id: Number.parseInt(e.target.value, 10) })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        required
                                        aria-label="Select client"
                                    >
                                        <option value="">Select Client</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id}>{c.client_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-480" className="block text-sm font-medium mb-1">Hire Date *</label>
                                    <input id="field-480"
                                        type="date"
                                        value={bookingForm.hire_date}
                                        onChange={(e) => setBookingForm({ ...bookingForm, hire_date: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Hire date"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="field-491" className="block text-sm font-medium mb-1">Return Date</label>
                                    <input id="field-491"
                                        type="date"
                                        value={bookingForm.return_date}
                                        onChange={(e) => setBookingForm({ ...bookingForm, return_date: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Return date"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="field-502" className="block text-sm font-medium mb-1">Destination</label>
                                <input id="field-502"
                                    type="text"
                                    value={bookingForm.destination}
                                    onChange={(e) => setBookingForm({ ...bookingForm, destination: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    placeholder="e.g., Nairobi"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-513" className="block text-sm font-medium mb-1">Distance (km)</label>
                                    <input id="field-513"
                                        type="number"
                                        value={bookingForm.distance_km}
                                        onChange={(e) => setBookingForm({ ...bookingForm, distance_km: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        placeholder="e.g., 200"
                                        aria-label="Distance in kilometers"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="field-524" className="block text-sm font-medium mb-1">Total Amount (KES) *</label>
                                    <input id="field-524"
                                        type="number"
                                        value={bookingForm.total_amount}
                                        onChange={(e) => setBookingForm({ ...bookingForm, total_amount: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        required
                                        aria-label="Total amount in KES"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="field-536" className="block text-sm font-medium mb-1">Purpose</label>
                                <textarea id="field-536"
                                    value={bookingForm.purpose}
                                    onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    rows={2}
                                    placeholder="e.g., Church trip"
                                    aria-label="Booking purpose"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBookingModal(false)}
                                    className="px-4 py-2 bg-secondary rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                                >
                                    Create Booking
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* New Client Modal */}
            {showClientModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">New Client</h2>
                        <form onSubmit={handleCreateClient} className="space-y-4">
                            <div>
                                <label htmlFor="field-573" className="block text-sm font-medium mb-1">Client Name *</label>
                                <input id="field-573"
                                    type="text"
                                    value={clientForm.client_name}
                                    onChange={(e) => setClientForm({ ...clientForm, client_name: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    required
                                    aria-label="Client name"
                                />
                            </div>
                            <div>
                                <label htmlFor="field-584" className="block text-sm font-medium mb-1">Organization</label>
                                <input id="field-584"
                                    type="text"
                                    value={clientForm.organization}
                                    onChange={(e) => setClientForm({ ...clientForm, organization: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    aria-label="Organization name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-595" className="block text-sm font-medium mb-1">Phone</label>
                                    <input id="field-595"
                                        type="tel"
                                        value={clientForm.contact_phone}
                                        onChange={(e) => setClientForm({ ...clientForm, contact_phone: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Contact phone"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="field-605" className="block text-sm font-medium mb-1">Email</label>
                                    <input id="field-605"
                                        type="email"
                                        value={clientForm.contact_email}
                                        onChange={(e) => setClientForm({ ...clientForm, contact_email: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Contact email"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowClientModal(false)}
                                    className="px-4 py-2 bg-secondary rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                                >
                                    Save Client
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedBooking && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Record Payment</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            Booking: {selectedBooking.booking_number} | Balance: {formatCurrencyFromCents(selectedBooking.balance || 0)}
                        </p>
                        <form onSubmit={handleRecordPayment} className="space-y-4">
                            <div>
                                <label htmlFor="field-645" className="block text-sm font-medium mb-1">Amount (KES) *</label>
                                <input id="field-645"
                                    type="number"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    max={selectedBooking.balance}
                                    required
                                    aria-label="Payment amount in KES"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-658" className="block text-sm font-medium mb-1">Payment Method</label>
                                    <select id="field-658"
                                        value={paymentForm.payment_method}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Payment method"
                                    >
                                        <option value="CASH">Cash</option>
                                        <option value="MPESA">M-Pesa</option>
                                        <option value="BANK">Bank Transfer</option>
                                        <option value="CHEQUE">Cheque</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="field-672" className="block text-sm font-medium mb-1">Date</label>
                                    <input id="field-672"
                                        type="date"
                                        value={paymentForm.payment_date}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Payment date"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="field-683" className="block text-sm font-medium mb-1">Reference</label>
                                <input id="field-683"
                                    type="text"
                                    value={paymentForm.payment_reference}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_reference: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    placeholder="e.g., M-Pesa code"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }}
                                    className="px-4 py-2 bg-secondary rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-success text-white rounded-lg"
                                >
                                    Record Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
