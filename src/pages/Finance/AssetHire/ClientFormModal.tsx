import { type ClientForm } from './useAssetHireData'

interface ClientFormModalProps {
    readonly form: ClientForm
    readonly onChange: (form: ClientForm) => void
    readonly onSubmit: (e: React.SyntheticEvent) => void
    readonly onClose: () => void
}

export function ClientFormModal({ form, onChange, onSubmit, onClose }: ClientFormModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">New Client</h2>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="client-name" className="block text-sm font-medium mb-1">Client Name *</label>
                        <input
                            id="client-name"
                            type="text"
                            value={form.client_name}
                            onChange={(e) => onChange({ ...form, client_name: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            required
                            aria-label="Client name"
                        />
                    </div>
                    <div>
                        <label htmlFor="client-org" className="block text-sm font-medium mb-1">Organization</label>
                        <input
                            id="client-org"
                            type="text"
                            value={form.organization}
                            onChange={(e) => onChange({ ...form, organization: e.target.value })}
                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                            aria-label="Organization name"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="client-phone" className="block text-sm font-medium mb-1">Phone</label>
                            <input
                                id="client-phone"
                                type="tel"
                                value={form.contact_phone}
                                onChange={(e) => onChange({ ...form, contact_phone: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                aria-label="Contact phone"
                            />
                        </div>
                        <div>
                            <label htmlFor="client-email" className="block text-sm font-medium mb-1">Email</label>
                            <input
                                id="client-email"
                                type="email"
                                value={form.contact_email}
                                onChange={(e) => onChange({ ...form, contact_email: e.target.value })}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                aria-label="Contact email"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
                            Save Client
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
