import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores'
import { HireBooking, HireAsset, HireClient, HireStats } from '../../types/electron-api/HireAPI'
import { printDocument } from '../../utils/print'

type TabType = 'bookings' | 'clients' | 'assets'

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
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [bookingsRes, clientsRes, assetsRes, statsRes] = await Promise.all([
                window.electronAPI.getHireBookings(),
                window.electronAPI.getHireClients(),
                window.electronAPI.getHireAssets({ isActive: true }),
                window.electronAPI.getHireStats()
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
        if (!user) return

        // Validate
        if (!bookingForm.asset_id || !bookingForm.client_id || !bookingForm.total_amount) {
            alert('Please fill in all required fields')
            return
        }

        // Check availability
        const available = await window.electronAPI.checkHireAvailability(
            bookingForm.asset_id,
            bookingForm.hire_date,
            bookingForm.return_date || undefined
        )
        if (!available) {
            alert('Asset is not available for the selected dates')
            return
        }

        const result = await window.electronAPI.createHireBooking({
            ...bookingForm,
            distance_km: bookingForm.distance_km ? parseFloat(bookingForm.distance_km) : undefined,
            total_amount: Math.round(parseFloat(bookingForm.total_amount))
        }, user.id)

        if (result.success) {
            alert(`Booking created! Number: ${result.booking_number}`)
            setShowBookingModal(false)
            setBookingForm({
                asset_id: 0, client_id: 0, hire_date: new Date().toISOString().split('T')[0],
                return_date: '', purpose: '', destination: '', distance_km: '', total_amount: ''
            })
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = await window.electronAPI.createHireClient(clientForm)
        if (result.success) {
            alert('Client created successfully!')
            setShowClientModal(false)
            setClientForm({ client_name: '', contact_phone: '', contact_email: '', organization: '', address: '', notes: '' })
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !selectedBooking) return

        const result = await window.electronAPI.recordHirePayment(
            selectedBooking.id,
            {
                ...paymentForm,
                amount: Math.round(parseFloat(paymentForm.amount))
            },
            user.id
        )

        if (result.success) {
            alert(`Payment recorded! Receipt: ${result.receipt_number}`)
            setShowPaymentModal(false)
            setPaymentForm({ amount: '', payment_method: 'CASH', payment_reference: '', payment_date: new Date().toISOString().split('T')[0] })
            setSelectedBooking(null)
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleUpdateStatus = async (bookingId: number, status: string) => {
        const result = await window.electronAPI.updateHireBookingStatus(bookingId, status)
        if (result.success) {
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handlePrintReceipt = async (booking: HireBooking) => {
        const payments = await window.electronAPI.getHirePaymentsByBooking(booking.id)
        const latestPayment = payments[0]
        if (!latestPayment) {
            alert('No payments to print')
            return
        }

        const settings = await window.electronAPI.getSchoolSettings()
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
                amountInWords: `${numberToWords(latestPayment.amount)} Shillings Only`
            },
            schoolSettings: settings || {}
        })
    }

    const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

        if (num === 0) return 'Zero'
        if (num < 20) return ones[num]
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '')
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '')
        if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '')
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PENDING': return 'bg-yellow-100 text-yellow-800'
            case 'CONFIRMED': return 'bg-blue-100 text-blue-800'
            case 'IN_PROGRESS': return 'bg-purple-100 text-purple-800'
            case 'COMPLETED': return 'bg-green-100 text-green-800'
            case 'CANCELLED': return 'bg-red-100 text-red-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    if (loading) {
        return <div className="p-6 text-center">Loading...</div>
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Asset Hire Management</h1>
                    <p className="text-gray-600">Manage bus and asset rentals</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowClientModal(true)}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                        + New Client
                    </button>
                    <button
                        onClick={() => setShowBookingModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        + New Booking
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                        <div className="text-sm text-gray-500">Total Bookings</div>
                        <div className="text-2xl font-bold">{stats.totalBookings}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                        <div className="text-sm text-gray-500">Total Income</div>
                        <div className="text-2xl font-bold">KES {stats.totalIncome.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
                        <div className="text-sm text-gray-500">Pending Amount</div>
                        <div className="text-2xl font-bold">KES {stats.pendingAmount.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                        <div className="text-sm text-gray-500">This Month</div>
                        <div className="text-2xl font-bold">KES {stats.thisMonth.toLocaleString()}</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="flex space-x-8">
                    {(['bookings', 'clients', 'assets'] as TabType[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    className="px-4 py-2 border rounded-lg w-64"
                />
                {activeTab === 'bookings' && (
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border rounded-lg"
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
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {activeTab === 'bookings' && (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredBookings.map(booking => (
                                <tr key={booking.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{booking.booking_number}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.client_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.asset_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(booking.hire_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">KES {booking.total_amount.toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                                        KES {(booking.balance || 0).toLocaleString()}
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
                                                    onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); setPaymentForm({ ...paymentForm, amount: String(booking.balance || 0) }) }}
                                                    className="text-green-600 hover:text-green-800"
                                                >
                                                    Pay
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateStatus(booking.id, 'CANCELLED')}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                        {booking.amount_paid > 0 && (
                                            <button
                                                onClick={() => handlePrintReceipt(booking)}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                Print
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredBookings.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                        No bookings found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {activeTab === 'clients' && (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
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
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default Rate</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate Type</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {assets.map(asset => (
                                <tr key={asset.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{asset.asset_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.asset_type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">KES {(asset.default_rate || 0).toLocaleString()}</td>
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
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">New Booking</h2>
                        <form onSubmit={handleCreateBooking} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Asset *</label>
                                    <select
                                        value={bookingForm.asset_id}
                                        onChange={(e) => setBookingForm({ ...bookingForm, asset_id: parseInt(e.target.value) })}
                                        className="w-full border rounded-lg p-2"
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
                                    <label className="block text-sm font-medium mb-1">Client *</label>
                                    <select
                                        value={bookingForm.client_id}
                                        onChange={(e) => setBookingForm({ ...bookingForm, client_id: parseInt(e.target.value) })}
                                        className="w-full border rounded-lg p-2"
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
                                    <label className="block text-sm font-medium mb-1">Hire Date *</label>
                                    <input
                                        type="date"
                                        value={bookingForm.hire_date}
                                        onChange={(e) => setBookingForm({ ...bookingForm, hire_date: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Hire date"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Return Date</label>
                                    <input
                                        type="date"
                                        value={bookingForm.return_date}
                                        onChange={(e) => setBookingForm({ ...bookingForm, return_date: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Return date"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Destination</label>
                                <input
                                    type="text"
                                    value={bookingForm.destination}
                                    onChange={(e) => setBookingForm({ ...bookingForm, destination: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    placeholder="e.g., Nairobi"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Distance (km)</label>
                                    <input
                                        type="number"
                                        value={bookingForm.distance_km}
                                        onChange={(e) => setBookingForm({ ...bookingForm, distance_km: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        placeholder="e.g., 200"
                                        aria-label="Distance in kilometers"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Total Amount (KES) *</label>
                                    <input
                                        type="number"
                                        value={bookingForm.total_amount}
                                        onChange={(e) => setBookingForm({ ...bookingForm, total_amount: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        required
                                        aria-label="Total amount in KES"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Purpose</label>
                                <textarea
                                    value={bookingForm.purpose}
                                    onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    rows={2}
                                    placeholder="e.g., Church trip"
                                    aria-label="Booking purpose"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBookingModal(false)}
                                    className="px-4 py-2 bg-gray-200 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">New Client</h2>
                        <form onSubmit={handleCreateClient} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Client Name *</label>
                                <input
                                    type="text"
                                    value={clientForm.client_name}
                                    onChange={(e) => setClientForm({ ...clientForm, client_name: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    required
                                    aria-label="Client name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Organization</label>
                                <input
                                    type="text"
                                    value={clientForm.organization}
                                    onChange={(e) => setClientForm({ ...clientForm, organization: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    aria-label="Organization name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={clientForm.contact_phone}
                                        onChange={(e) => setClientForm({ ...clientForm, contact_phone: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Contact phone"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={clientForm.contact_email}
                                        onChange={(e) => setClientForm({ ...clientForm, contact_email: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Contact email"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowClientModal(false)}
                                    className="px-4 py-2 bg-gray-200 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Record Payment</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Booking: {selectedBooking.booking_number} | Balance: KES {selectedBooking.balance?.toLocaleString()}
                        </p>
                        <form onSubmit={handleRecordPayment} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Amount (KES) *</label>
                                <input
                                    type="number"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    max={selectedBooking.balance}
                                    required
                                    aria-label="Payment amount in KES"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Payment Method</label>
                                    <select
                                        value={paymentForm.payment_method}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Payment method"
                                    >
                                        <option value="CASH">Cash</option>
                                        <option value="MPESA">M-Pesa</option>
                                        <option value="BANK">Bank Transfer</option>
                                        <option value="CHEQUE">Cheque</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={paymentForm.payment_date}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Payment date"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Reference</label>
                                <input
                                    type="text"
                                    value={paymentForm.payment_reference}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_reference: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    placeholder="e.g., M-Pesa code"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }}
                                    className="px-4 py-2 bg-gray-200 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg"
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
