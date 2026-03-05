import { type FeeExemption } from '../../../types/electron-api/ExemptionAPI'

interface RevokeExemptionModalProps {
    showRevokeModal: boolean
    setShowRevokeModal: (show: boolean) => void
    selectedExemption: FeeExemption | null
    setSelectedExemption: (e: FeeExemption | null) => void
    revokeReason: string
    setRevokeReason: (reason: string) => void
    handleRevoke: () => void
}

export function RevokeExemptionModal({ showRevokeModal, setShowRevokeModal, selectedExemption, setSelectedExemption, revokeReason, setRevokeReason, handleRevoke }: Readonly<RevokeExemptionModalProps>) {
    if (!showRevokeModal || !selectedExemption) { return null }
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-red-600">Revoke Exemption</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Are you sure you want to revoke the {selectedExemption.exemption_percentage}% exemption for {selectedExemption.student_name}?
                </p>
                <div className="mb-4">
                    <label htmlFor="field-471" className="block text-sm font-medium mb-1">Reason for Revocation *</label>
                    <textarea id="field-471"
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                        rows={3}
                        placeholder="Please provide a reason..."
                        required
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => { setShowRevokeModal(false); setSelectedExemption(null); setRevokeReason(''); }}
                        className="px-4 py-2 bg-secondary rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRevoke}
                        className="px-4 py-2 bg-destructive text-white rounded-lg"
                    >
                        Revoke Exemption
                    </button>
                </div>
            </div>
        </div>
    )
}
