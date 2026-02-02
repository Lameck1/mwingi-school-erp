import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

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

export function StatCard({
    label,
    value,
    icon: Icon,
    color = 'from-indigo-500/10 to-blue-500/10 text-indigo-500 dark:text-indigo-400',
    trend,
    trendLabel,
    loading = false,
    compact = false
}: StatCardProps) {
    return (
        <div className={`premium-card group ${compact ? 'p-3' : ''}`}>
            <div className="flex items-start justify-between">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className={`rounded-xl bg-gradient-to-br transition-transform duration-500 group-hover:scale-110 ${color} ${compact ? 'p-2' : 'p-2.5'}`}>
                            <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                        </div>
                        <span className={`uppercase tracking-[0.2em] font-bold text-foreground/50 dark:text-foreground/40 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                            {label}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <h3 className={`font-bold tracking-tight text-foreground font-heading ${compact ? 'text-2xl' : 'text-3xl'}`}>
                            {loading ? (
                                <div className="h-9 w-24 bg-secondary animate-pulse rounded" />
                            ) : (
                                value
                            )}
                        </h3>

                        {trend && (
                            <div className={`flex items-center gap-1.5 text-xs font-bold ${trend === 'up' ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                {trend === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                <span>{trendLabel}</span>
                            </div>
                        )}
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
