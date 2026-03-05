import { useEffect } from 'react'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

import { AssetsTable } from './AssetHire/AssetsTable'
import { BookingFormModal } from './AssetHire/BookingFormModal'
import { BookingsTable } from './AssetHire/BookingsTable'
import { ClientFormModal } from './AssetHire/ClientFormModal'
import { ClientsTable } from './AssetHire/ClientsTable'
import { HireStatsCards } from './AssetHire/HireStatsCards'
import { PaymentFormModal } from './AssetHire/PaymentFormModal'
import { useAssetHireData } from './AssetHire/useAssetHireData'

type TabType = 'bookings' | 'clients' | 'assets'
const TABS: TabType[] = ['bookings', 'clients', 'assets']

export default function AssetHire() {
    const d = useAssetHireData()
    const { loadData } = d

    useEffect(() => { void loadData() }, [loadData])

    if (d.loading) {
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
                        onClick={() => d.setShowClientModal(true)}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
                    >
                        + New Client
                    </button>
                    <button
                        onClick={() => d.setShowBookingModal(true)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80"
                    >
                        + New Booking
                    </button>
                </div>
            </div>

            {d.stats && <HireStatsCards stats={d.stats} />}

            {/* Tabs */}
            <div className="border-b border-border">
                <nav className="flex space-x-8">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => d.setActiveTab(tab)}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                d.activeTab === tab
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
                    value={d.searchQuery}
                    onChange={(e) => d.setSearchQuery(e.target.value)}
                    className="px-4 py-2 border border-border rounded-lg w-full sm:w-64 bg-input text-foreground"
                />
                {d.activeTab === 'bookings' && (
                    <select
                        value={d.statusFilter}
                        onChange={(e) => d.setStatusFilter(e.target.value)}
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
                {d.activeTab === 'bookings' && (
                    <BookingsTable
                        bookings={d.filteredBookings}
                        onPay={d.openPaymentModal}
                        onCancel={(id) => d.handleUpdateStatus(id, 'CANCELLED')}
                        onPrint={d.handlePrintReceipt}
                    />
                )}
                {d.activeTab === 'clients' && <ClientsTable clients={d.filteredClients} />}
                {d.activeTab === 'assets' && <AssetsTable assets={d.assets} />}
            </div>

            {/* Modals */}
            {d.showBookingModal && (
                <BookingFormModal
                    assets={d.assets}
                    clients={d.filteredClients}
                    form={d.bookingForm}
                    onChange={d.setBookingForm}
                    onSubmit={d.handleCreateBooking}
                    onClose={() => d.setShowBookingModal(false)}
                />
            )}
            {d.showClientModal && (
                <ClientFormModal
                    form={d.clientForm}
                    onChange={d.setClientForm}
                    onSubmit={d.handleCreateClient}
                    onClose={() => d.setShowClientModal(false)}
                />
            )}
            {d.showPaymentModal && d.selectedBooking && (
                <PaymentFormModal
                    booking={d.selectedBooking}
                    form={d.paymentForm}
                    onChange={d.setPaymentForm}
                    onSubmit={d.handleRecordPayment}
                    onClose={d.closePaymentModal}
                />
            )}
        </div>
    )
}
