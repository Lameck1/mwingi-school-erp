import { type HireBooking } from '../../../types/electron-api/HireAPI'
import { formatCurrencyFromCents, centsToShillings } from '../../../utils/format'
import { type PaymentForm } from './useAssetHireData'

interface PaymentFormModalProps {
    readonly booking: HireBooking
    readonly form: PaymentForm
    readonly onChange: (form: PaymentForm) => void
    readonly onSubmit: (e: React.SyntheticEvent) => void
    readonly onClose: () => void
}

export function PaymentFormModal({ booking, form, onChange, onSubmit, onClose }: PaymentFormModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Record Payment</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Booking: {booking.booking_number} | Balance: {formatCurrencyFromCents(booking.balance || 0)}
                </p>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="payment-amount" className="block text-sm font-medium mb-1">Amount (KES) *</label>
                        <input
                            id="payment-amount"
                            type="number"
                            value={form.amount}
                            onChange={(e) => onChange({ ...form, amount: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            max={centsToShillings(booking.balance || 0)}
                            required
                            aria-label="Payment amount in KES"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="payment-method" className="block text-sm font-medium mb-1">Payment Method</label>
                            <select
                                id="payment-method"
                                value={form.payment_method}
                                onChange={(e) => onChange({ ...form, payment_method: e.target.value })}
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
                            <label htmlFor="payment-date" className="block text-sm font-medium mb-1">Date</label>
                            <input
                                id="payment-date"
                                type="date"
                                value={form.payment_date}
                                onChange={(e) => onChange({ ...form, payment_date: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                aria-label="Payment date"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="payment-ref" className="block text-sm font-medium mb-1">Reference</label>
                        <input
                            id="payment-ref"
                            type="text"
                            value={form.payment_reference}
                            onChange={(e) => onChange({ ...form, payment_reference: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            placeholder="e.g., M-Pesa code"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-success text-white rounded-lg">
                            Record Payment
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
