import { type HireAsset, type HireClient } from '../../../types/electron-api/HireAPI'
import { type BookingForm } from './useAssetHireData'

interface BookingFormModalProps {
    readonly assets: HireAsset[]
    readonly clients: HireClient[]
    readonly form: BookingForm
    readonly onChange: (form: BookingForm) => void
    readonly onSubmit: (e: React.SyntheticEvent) => void
    readonly onClose: () => void
}

export function BookingFormModal({ assets, clients, form, onChange, onSubmit, onClose }: BookingFormModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">New Booking</h2>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="booking-asset" className="block text-sm font-medium mb-1">Asset *</label>
                            <select
                                id="booking-asset"
                                value={form.asset_id}
                                onChange={(e) => onChange({ ...form, asset_id: Number.parseInt(e.target.value, 10) })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                required
                                aria-label="Select asset"
                            >
                                <option value="">Select Asset</option>
                                {assets.map((a) => (
                                    <option key={a.id} value={a.id}>{a.asset_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="booking-client" className="block text-sm font-medium mb-1">Client *</label>
                            <select
                                id="booking-client"
                                value={form.client_id}
                                onChange={(e) => onChange({ ...form, client_id: Number.parseInt(e.target.value, 10) })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                required
                                aria-label="Select client"
                            >
                                <option value="">Select Client</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.client_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="booking-hire-date" className="block text-sm font-medium mb-1">Hire Date *</label>
                            <input
                                id="booking-hire-date"
                                type="date"
                                value={form.hire_date}
                                onChange={(e) => onChange({ ...form, hire_date: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                required
                                aria-label="Hire date"
                            />
                        </div>
                        <div>
                            <label htmlFor="booking-return-date" className="block text-sm font-medium mb-1">Return Date</label>
                            <input
                                id="booking-return-date"
                                type="date"
                                value={form.return_date}
                                onChange={(e) => onChange({ ...form, return_date: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                aria-label="Return date"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="booking-destination" className="block text-sm font-medium mb-1">Destination</label>
                        <input
                            id="booking-destination"
                            type="text"
                            value={form.destination}
                            onChange={(e) => onChange({ ...form, destination: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            placeholder="e.g., Nairobi"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="booking-distance" className="block text-sm font-medium mb-1">Distance (km)</label>
                            <input
                                id="booking-distance"
                                type="number"
                                value={form.distance_km}
                                onChange={(e) => onChange({ ...form, distance_km: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                placeholder="e.g., 200"
                                aria-label="Distance in kilometers"
                            />
                        </div>
                        <div>
                            <label htmlFor="booking-amount" className="block text-sm font-medium mb-1">Total Amount (KES) *</label>
                            <input
                                id="booking-amount"
                                type="number"
                                value={form.total_amount}
                                onChange={(e) => onChange({ ...form, total_amount: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                required
                                aria-label="Total amount in KES"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="booking-purpose" className="block text-sm font-medium mb-1">Purpose</label>
                        <textarea
                            id="booking-purpose"
                            value={form.purpose}
                            onChange={(e) => onChange({ ...form, purpose: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            rows={2}
                            placeholder="e.g., Church trip"
                            aria-label="Booking purpose"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
                            Create Booking
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
