import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
    label: string
    value: string | number
    icon: LucideIcon
    color?: string
    trend?: 'up' | 'down'
    trendLabel?: string
    loading?: boolean
    compact?: boolean
}

function StatValue({ loading, value }: Readonly<{ loading: boolean; value: string | number }>) {
    if (loading) {
        return <div className="h-9 w-24 bg-secondary animate-pulse rounded" />
    }

    return <>{value}</>
}

function StatTrend({
    trend,
    trendLabel
}: Readonly<{ trend?: 'up' | 'down'; trendLabel?: string }>) {
    if (!trend) {
        return null
    }

    const trendIsUp = trend === 'up'
    const trendClassName = trendIsUp ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
    const TrendIcon = trendIsUp ? TrendingUp : TrendingDown

    return (
        <div className={`flex items-center gap-1.5 text-xs font-bold ${trendClassName}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span>{trendLabel}</span>
        </div>
    )
}

export function StatCard({
    label,
    value,
    icon: Icon,
    color = 'from-indigo-500/10 to-blue-500/10 text-indigo-500 dark:text-indigo-400',
    trend,
    trendLabel,
    loading = false,
    compact = false
}: Readonly<StatCardProps>) {
    const containerPaddingClass = compact ? 'p-3' : ''
    const iconPaddingClass = compact ? 'p-2' : 'p-2.5'
    const iconSizeClass = compact ? 'w-4 h-4' : 'w-5 h-5'
    const labelSizeClass = compact ? 'text-[9px]' : 'text-[10px]'
    const valueSizeClass = compact ? 'text-2xl' : 'text-3xl'

    return (
        <div className={`premium-card group ${containerPaddingClass}`}>
            <div className="flex items-start justify-between">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className={`rounded-xl bg-gradient-to-br transition-transform duration-500 group-hover:scale-110 ${color} ${iconPaddingClass}`}>
                            <Icon className={iconSizeClass} />
                        </div>
                        <span className={`uppercase tracking-[0.2em] font-bold text-foreground/50 dark:text-foreground/40 ${labelSizeClass}`}>
                            {label}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <h3 className={`font-bold tracking-tight text-foreground font-heading ${valueSizeClass}`}>
                            <StatValue loading={loading} value={value} />
                        </h3>

                        <StatTrend trend={trend} trendLabel={trendLabel} />
                    </div>
                </div>

                {/* Abstract background decorative element */}
                <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-[0.03] transition-opacity duration-700 group-hover:opacity-[0.07]">
                    <Icon className="w-32 h-32 rotate-12" />
                </div>
            </div>
        </div>
    )
}
