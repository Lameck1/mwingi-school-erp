import { useState, useEffect } from 'react'
import {
    MessageSquare, Mail, CheckCircle, XCircle
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'

interface LogEntry {
    id: number
    recipient_type: string
    recipient_id: number
    message_type: 'SMS' | 'EMAIL'
    subject: string | null
    message_body: string
    status: 'SENT' | 'FAILED'
    error_message: string | null
    sent_by_name: string
    created_at: string
}

export default function CommunicationLog() {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, sms: 0, email: 0 })

    // Filters
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'SMS' | 'EMAIL'>('ALL')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL')

    useEffect(() => {
        loadLogs()
    }, [typeFilter, statusFilter])

    const loadLogs = async () => {
        setLoading(true)
        try {
            const filters: any = {}
            if (typeFilter !== 'ALL') filters.channel = typeFilter
            if (statusFilter !== 'ALL') filters.status = statusFilter

            const data = await (window.electronAPI as unknown).getNotificationHistory(filters)
            setLogs(data)
            calculateStats(data)
        } catch (error) {
            console.error('Failed to load logs:', error)
        } finally {
            setLoading(false)
        }
    }

    const calculateStats = (data: LogEntry[]) => {
        setStats({
            total: data.length,
            sent: data.filter(l => l.status === 'SENT').length,
            failed: data.filter(l => l.status === 'FAILED').length,
            sms: data.filter(l => l.message_type === 'SMS').length,
            email: data.filter(l => l.message_type === 'EMAIL').length
        })
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Communication Log"
                subtitle="History of sent SMS and Email notifications"
                breadcrumbs={[{ label: 'Communications' }, { label: 'Logs' }]}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Total Messages" value={stats.total.toString()} icon={MessageSquare} color="from-blue-500/20 to-indigo-500/20 text-blue-400" compact />
                <StatCard label="Sent" value={stats.sent.toString()} icon={CheckCircle} color="from-green-500/20 to-emerald-500/20 text-green-400" compact />
                <StatCard label="Failed" value={stats.failed.toString()} icon={XCircle} color="from-red-500/20 to-rose-500/20 text-red-400" compact />
                <StatCard label="SMS" value={stats.sms.toString()} icon={MessageSquare} color="from-amber-500/20 to-orange-500/20 text-amber-400" compact />
                <StatCard label="Emails" value={stats.email.toString()} icon={Mail} color="from-purple-500/20 to-pink-500/20 text-purple-400" compact />
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <div className="flex bg-secondary/30 border border-border/20 rounded-lg p-1">
                    {(['ALL', 'SMS', 'EMAIL'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => setTypeFilter(type)}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all duration-300 ${typeFilter === type ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground/60 hover:text-foreground'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="flex bg-secondary/30 border border-border/20 rounded-lg p-1">
                    {(['ALL', 'SENT', 'FAILED'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all duration-300 ${statusFilter === status
                                ? status === 'FAILED' ? 'bg-red-500 text-white shadow-lg' : 'bg-green-500 text-white shadow-lg'
                                : 'text-foreground/60 hover:text-foreground'
                                }`}
                        >
                            {status === 'ALL' ? 'All Status' : status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs Table */}
            <div className="premium-card">
                {loading ? (
                    <div className="text-center py-16 text-foreground/40">Loading history...</div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16 text-foreground/40">No communication history found</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs font-bold text-foreground/40 uppercase border-b border-border/20">
                                    <th className="text-left py-3 px-4">Time</th>
                                    <th className="text-left py-3 px-4">Channel</th>
                                    <th className="text-left py-3 px-4">Recipient</th>
                                    <th className="text-left py-3 px-4">Message</th>
                                    <th className="text-left py-3 px-4">Status</th>
                                    <th className="text-left py-3 px-4">Sent By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-secondary/40 transition-colors duration-200">
                                        <td className="py-3 px-4 text-sm font-mono text-foreground/60 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold ${log.message_type === 'SMS'
                                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                }`}>
                                                {log.message_type === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                                                {log.message_type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm">
                                            <div className="font-bold text-foreground">{log.recipient_type}</div>
                                            <div className="text-xs text-foreground/50">ID: {log.recipient_id}</div>
                                        </td>
                                        <td className="py-3 px-4 text-sm max-w-md">
                                            {log.subject && (
                                                <div className="font-bold text-foreground mb-1">{log.subject}</div>
                                            )}
                                            <div className="text-foreground/70 line-clamp-2">{log.message_body}</div>
                                            {log.error_message && (
                                                <div className="text-red-400 text-xs mt-1">{log.error_message}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {log.status === 'SENT' ? (
                                                <span className="inline-flex items-center gap-1 text-green-400 text-xs font-bold">
                                                    <CheckCircle className="w-3 h-3" /> Sent
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold">
                                                    <XCircle className="w-3 h-3" /> Failed
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-foreground/60">
                                            {log.sent_by_name}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

