import { type HireBooking } from '../../../types/electron-api/HireAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    CONFIRMED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    IN_PROGRESS: 'bg-purple-100 text-purple-800',
    COMPLETED: 'bg-green-500/15 text-green-600 dark:text-green-400',
    CANCELLED: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

interface BookingsTableProps {
    readonly bookings: HireBooking[]
    readonly onPay: (booking: HireBooking) => void
    readonly onCancel: (bookingId: number) => void
    readonly onPrint: (booking: HireBooking) => void
}

export function BookingsTable({ bookings, onPay, onCancel, onPrint }: BookingsTableProps) {
    return (
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
                {bookings.map((booking) => (
                    <BookingRow
                        key={booking.id}
                        booking={booking}
                        onPay={onPay}
                        onCancel={onCancel}
                        onPrint={onPrint}
                    />
                ))}
                {bookings.length === 0 && (
                    <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                            No bookings found
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    )
}

function BookingRow({
    booking,
    onPay,
    onCancel,
    onPrint,
}: Readonly<{
    booking: HireBooking
    onPay: (b: HireBooking) => void
    onCancel: (id: number) => void
    onPrint: (b: HireBooking) => void
}>) {
    const isActionable = booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED'

    return (
        <tr>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{booking.booking_number}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.client_name}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.asset_name}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(booking.hire_date).toLocaleDateString()}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{formatCurrencyFromCents(booking.total_amount)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                {formatCurrencyFromCents(booking.balance || 0)}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[booking.status] ?? 'bg-secondary text-foreground'}`}>
                    {booking.status}
                </span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                {isActionable && (
                    <>
                        <button onClick={() => onPay(booking)} className="text-success hover:text-success/80">
                            Pay
                        </button>
                        <button onClick={() => onCancel(booking.id)} className="text-destructive hover:text-destructive/80">
                            Cancel
                        </button>
                    </>
                )}
                {booking.amount_paid > 0 && (
                    <button onClick={() => onPrint(booking)} className="text-primary hover:text-primary/80">
                        Print
                    </button>
                )}
            </td>
        </tr>
    )
}
