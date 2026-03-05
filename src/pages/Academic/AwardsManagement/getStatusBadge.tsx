import { CheckCircle, Clock, XCircle } from 'lucide-react'

export function getStatusBadge(status: string) {
    switch (status) {
        case 'pending':
            return (
                <div className="flex items-center gap-1 text-amber-400">
                    <Clock size={16} />
                    <span className="text-xs font-semibold">Pending</span>
                </div>
            )
        case 'approved':
            return (
                <div className="flex items-center gap-1 text-green-400">
                    <CheckCircle size={16} />
                    <span className="text-xs font-semibold">Approved</span>
                </div>
            )
        case 'rejected':
            return (
                <div className="flex items-center gap-1 text-red-400">
                    <XCircle size={16} />
                    <span className="text-xs font-semibold">Rejected</span>
                </div>
            )
        default:
            return null
    }
}
