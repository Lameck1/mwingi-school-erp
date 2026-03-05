import { type FeeExemption } from '../../../types/electron-api/ExemptionAPI'

export function getReasonBadgeColor(reason: string): string {
    const lowerReason = reason.toLowerCase()
    if (lowerReason.includes('scholarship')) {
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    }
    if (lowerReason.includes('staff')) {
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
    }
    if (lowerReason.includes('bursary')) {
        return 'bg-green-500/15 text-green-600 dark:text-green-400'
    }
    if (lowerReason.includes('orphan')) {
        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
    }
    return 'bg-secondary text-foreground'
}

interface ExemptionsTableProps {
    exemptions: FeeExemption[]
    setSelectedExemption: (e: FeeExemption) => void
    setShowRevokeModal: (show: boolean) => void
}

export function ExemptionsTable({ exemptions, setSelectedExemption, setShowRevokeModal }: Readonly<ExemptionsTableProps>) {
    return (
        <div className="bg-card rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-border">
                <thead className="bg-secondary">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Student</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Year/Term</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Exemption</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase max-w-[120px]">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Approved By</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                    {exemptions.map(exemption => (
                        <tr key={exemption.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium">{exemption.student_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {exemption.year_name} {exemption.term_name && `/ ${exemption.term_name}`}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {exemption.category_name || <span className="text-muted-foreground">All Categories</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-sm font-bold rounded ${exemption.exemption_percentage === 100
                                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                    : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                    }`}>
                                    {exemption.exemption_percentage}%
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs rounded-full ${getReasonBadgeColor(exemption.exemption_reason)}`}>
                                    {exemption.exemption_reason}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs rounded-full ${exemption.status === 'ACTIVE'
                                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                    }`}>
                                    {exemption.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                {exemption.approved_by_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {exemption.status === 'ACTIVE' && (
                                    <button
                                        onClick={() => { setSelectedExemption(exemption); setShowRevokeModal(true); }}
                                        className="text-destructive hover:text-destructive/80"
                                    >
                                        Revoke
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {exemptions.length === 0 && (
                        <tr>
                            <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                                No exemptions found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}
