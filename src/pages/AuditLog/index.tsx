import { Search, Loader2, History, Database, UserCheck, Activity } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { type AuditLogEntry } from '../../types/electron-api/AuditAPI'
import { formatDateTime } from '../../utils/format'

export default function AuditLog() {
    const { showToast } = useToast()
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState({ action: '', table: '', search: '' })

    const loadLogs = useCallback(async () => {
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getAuditLog(200)
            setLogs(data)
        } catch (error) {
            console.error('Failed to load audit logs:', error)
            showToast('Audit synchronization failed', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { loadLogs().catch((err: unknown) => console.error('Failed to load logs:', err)) }, [loadLogs])

    const actionColors: Record<string, string> = {
        CREATE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        UPDATE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        DELETE: 'bg-destructive/10 text-destructive border-destructive/20',
        LOGIN: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        VOID: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    }

    const filteredLogs = logs.filter(log => {
        const matchAction = !filter.action || log.action_type === filter.action
        const matchTable = !filter.table || log.table_name === filter.table
        const matchSearch = !filter.search ||
            log.user_name?.toLowerCase().includes(filter.search.toLowerCase()) ||
            String(log.record_id).includes(filter.search)
        return matchAction && matchTable && matchSearch
    })

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Audit Log</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Comprehensive system-wide change tracking and security oversight</p>
                </div>
                <div className="flex items-center gap-3 bg-secondary/20 p-2 rounded-xl border border-border/20">
                    <Activity className="w-5 h-5 text-primary opacity-60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 pr-2">Live Monitoring Active</span>
                </div>
            </div>

            <div className="premium-card animate-slide-up">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="relative flex-1 min-w-[300px] group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/20 group-focus-within:text-primary transition-colors" />
                        <input type="text" placeholder="Search by user or record ID..."
                            aria-label="Search logs"
                            value={filter.search}
                            onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
                            className="input w-full pl-12 bg-secondary/30 h-12" />
                    </div>

                    <div className="flex items-center gap-4">
                        <select value={filter.action} onChange={(e) => setFilter(prev => ({ ...prev, action: e.target.value }))}
                            aria-label="Filter by action"
                            className="input w-44 bg-secondary/30 h-12">
                            <option value="">All Actions</option>
                            <option value="CREATE">Create</option>
                            <option value="UPDATE">Update</option>
                            <option value="DELETE">Delete</option>
                            <option value="LOGIN">Login</option>
                            <option value="VOID">Void</option>
                        </select>
                        <select value={filter.table} onChange={(e) => setFilter(prev => ({ ...prev, table: e.target.value }))}
                            aria-label="Filter by table"
                            className="input w-44 bg-secondary/30 h-12">
                            <option value="">All Tables</option>
                            <option value="student">Students</option>
                            <option value="ledger_transaction">Transactions</option>
                            <option value="user">Users</option>
                            <option value="fee_invoice">Invoices</option>
                            <option value="inventory_item">Inventory</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="card overflow-hidden">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Fetching History...</p>
                    </div>
                )}
                {!loading && filteredLogs.length === 0 && (
                    <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                        <History className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-foreground/80 font-heading">No Historical Data</h3>
                        <p className="text-foreground/40 font-medium italic">No system events matched the active filtering parameters</p>
                    </div>
                )}
                {!loading && filteredLogs.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr className="border-b border-border/40">
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Chronology</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Operator</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-center">Protocol</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Data Entity</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Record Identity</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Payload Differential</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="group hover:bg-secondary/20 transition-colors">
                                        <td className="py-4">
                                            <div className="flex items-center gap-2 text-foreground/60 text-sm font-medium">
                                                <History className="w-3.5 h-3.5 opacity-40" />
                                                {formatDateTime(log.created_at)}
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <UserCheck className="w-4 h-4 text-primary opacity-40" />
                                                <span className="font-bold text-foreground/80">{log.user_name || 'Automated System'}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest border inline-block min-w-[100px] ${actionColors[log.action_type] || 'bg-secondary/50 text-foreground/50 border-border/40'
                                                }`}>
                                                {log.action_type}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <Database className="w-3.5 h-3.5 text-foreground/20" />
                                                <span className="font-mono text-sm text-foreground/50 uppercase tracking-tight">{log.table_name}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <span className="font-mono text-xs text-foreground/40">{log.record_id || 'N/A'}</span>
                                        </td>
                                        <td className="py-4 max-w-xs">
                                            <div className="bg-secondary/30 p-2 rounded-lg border border-border/20 group-hover:border-primary/20 transition-colors">
                                                <p className="font-mono text-[10px] text-foreground/50 truncate italic">
                                                    {(() => {
                                                        try {
                                                            if (!log.new_values) {return 'No mutation data'}
                                                            const parsed = JSON.parse(log.new_values)
                                                            return JSON.stringify(parsed)
                                                        } catch {
                                                            return log.new_values
                                                        }
                                                    })()}
                                                </p>
                                            </div>
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
