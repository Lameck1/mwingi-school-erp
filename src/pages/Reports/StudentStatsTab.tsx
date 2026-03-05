import { Users, TrendingUp, TrendingDown } from 'lucide-react'

import { StatCard } from '../../components/patterns/StatCard'

import { type StudentStats } from './types'

interface StudentStatsTabProps {
    readonly studentStats: StudentStats | null
}

export function StudentStatsTab({ studentStats }: StudentStatsTabProps) {
    return (
        <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase mb-8">Demographic Intelligence</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <StatCard
                    label="Institutional Population"
                    value={studentStats?.totalStudents || 0}
                    icon={Users}
                    color="from-blue-500/10 to-indigo-500/10 text-blue-500"
                />
                <StatCard
                    label="Day Scholars"
                    value={studentStats?.dayScholars || 0}
                    icon={TrendingUp}
                    color="from-emerald-500/10 to-teal-500/10 text-emerald-500"
                />
                <StatCard
                    label="Boarding Residents"
                    value={studentStats?.boarders || 0}
                    icon={TrendingDown}
                    color="from-purple-500/10 to-pink-500/10 text-purple-500"
                />
            </div>
        </div>
    )
}
