import { X } from 'lucide-react'

interface RejectAwardModalProps {
    showRejectModal: boolean
    setShowRejectModal: (show: boolean) => void
    rejectionReason: string
    setRejectionReason: (val: string) => void
    handleRejectAward: () => Promise<void>
    loading: boolean
}

export function RejectAwardModal({ showRejectModal, setShowRejectModal, rejectionReason, setRejectionReason, handleRejectAward, loading }: Readonly<RejectAwardModalProps>) {
    if (!showRejectModal) { return null }
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border border-border rounded-lg p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Reject Award</h3>
                    <button onClick={() => setShowRejectModal(false)} className="text-foreground/50 hover:text-foreground" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-sm text-foreground/60 mb-4">
                    Please provide a reason for rejecting this award.
                </p>
                <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter rejection reason..."
                    className="w-full h-24 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm resize-none focus:outline-none focus:border-primary"
                />
                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={() => setShowRejectModal(false)}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRejectAward}
                        disabled={loading || !rejectionReason.trim()}
                        className="btn bg-red-500 text-white hover:bg-red-600"
                    >
                        {loading ? 'Rejecting...' : 'Reject Award'}
                    </button>
                </div>
            </div>
        </div>
    )
}
