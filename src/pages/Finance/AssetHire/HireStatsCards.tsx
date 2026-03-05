import { type HireStats } from '../../../types/electron-api/HireAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

interface StatsCardsProps {
    readonly stats: HireStats
}

const CARDS = [
    { label: 'Total Bookings', key: 'totalBookings' as const, border: 'border-blue-500', isCurrency: false },
    { label: 'Total Income', key: 'totalIncome' as const, border: 'border-green-500', isCurrency: true },
    { label: 'Pending Amount', key: 'pendingAmount' as const, border: 'border-orange-500', isCurrency: true },
    { label: 'This Month', key: 'thisMonth' as const, border: 'border-purple-500', isCurrency: true },
] as const

export function HireStatsCards({ stats }: StatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {CARDS.map(({ label, key, border, isCurrency }) => (
                <div key={key} className={`bg-card p-4 rounded-lg shadow border-l-4 ${border}`}>
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div className="text-2xl font-bold">
                        {isCurrency ? formatCurrencyFromCents(stats[key]) : stats[key]}
                    </div>
                </div>
            ))}
        </div>
    )
}
