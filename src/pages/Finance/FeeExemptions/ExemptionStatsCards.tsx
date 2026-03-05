import { type ExemptionStats } from '../../../types/electron-api/ExemptionAPI'

interface ExemptionStatsCardsProps {
    stats: ExemptionStats | null
}

export function ExemptionStatsCards({ stats }: Readonly<ExemptionStatsCardsProps>) {
    if (!stats) { return null }
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card p-4 rounded-lg shadow border-l-4 border-blue-500">
                <div className="text-sm text-muted-foreground">Total Exemptions</div>
                <div className="text-2xl font-bold">{stats.totalExemptions}</div>
            </div>
            <div className="bg-card p-4 rounded-lg shadow border-l-4 border-green-500">
                <div className="text-sm text-muted-foreground">Active</div>
                <div className="text-2xl font-bold">{stats.activeExemptions}</div>
            </div>
            <div className="bg-card p-4 rounded-lg shadow border-l-4 border-purple-500">
                <div className="text-sm text-muted-foreground">Full (100%)</div>
                <div className="text-2xl font-bold">{stats.fullExemptions}</div>
            </div>
            <div className="bg-card p-4 rounded-lg shadow border-l-4 border-orange-500">
                <div className="text-sm text-muted-foreground">Partial</div>
                <div className="text-2xl font-bold">{stats.partialExemptions}</div>
            </div>
        </div>
    )
}
