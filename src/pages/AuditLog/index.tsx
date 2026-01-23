import { useEffect, useState } from 'react'
import { Shield, Search } from 'lucide-react'
import { AuditLogEntry } from '../../types/electron-api/AuditAPI'
import { formatDateTime } from '../../utils/format'

export default function AuditLog() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState({ action: '', table: '', search: '' })

    useEffect(() => { loadLogs() }, [])

    const loadLogs = async () => {
        try {
            const data = await window.electronAPI.getAuditLog(200)
            setLogs(data)
        } catch (error) {
            console.error('Failed to load audit logs:', error)
        } finally { setLoading(false) }
    }

    const actionColors: Record<string, string> = {
        CREATE: 'bg-green-100 text-green-700',
        UPDATE: 'bg-blue-100 text-blue-700',
        DELETE: 'bg-red-100 text-red-700',
        LOGIN: 'bg-purple-100 text-purple-700',
        VOID: 'bg-orange-100 text-orange-700',
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
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
                <p className="text-gray-500 mt-1">Track all system changes for accountability</p>
            </div>

            <div className="card mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="text" placeholder="Search by user or record ID..."
                            aria-label="Search logs"
                            value={filter.search}
                            onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
                            className="input pl-10" />
                    </div>
                    <select value={filter.action} onChange={(e) => setFilter(prev => ({ ...prev, action: e.target.value }))}
                        aria-label="Filter by action"
                        className="input w-40">
                        <option value="">All Actions</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                        <option value="LOGIN">Login</option>
                        <option value="VOID">Void</option>
                    </select>
                    <select value={filter.table} onChange={(e) => setFilter(prev => ({ ...prev, table: e.target.value }))}
                        aria-label="Filter by table"
                        className="input w-40">
                        <option value="">All Tables</option>
                        <option value="student">Students</option>
                        <option value="ledger_transaction">Transactions</option>
                        <option value="user">Users</option>
                        <option value="fee_invoice">Invoices</option>
                        <option value="inventory_item">Inventory</option>
                    </select>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12">
                        <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Audit Logs</h3>
                        <p className="text-gray-500">System activity will be recorded here</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Table</th>
                                    <th>Record ID</th>
                                    <th>Changes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="text-sm text-gray-500">
                                            {formatDateTime(log.created_at)}
                                        </td>
                                        <td>{log.user_name || 'System'}</td>
                                        <td>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action_type] || 'bg-gray-100 text-gray-700'
                                                }`}>{log.action_type}</span>
                                        </td>
                                        <td className="font-mono text-sm">{log.table_name}</td>
                                        <td>{log.record_id || '-'}</td>
                                        <td className="max-w-xs truncate text-sm text-gray-500">
                                            {/* Safe JSON display */}
                                            {(() => {
                                                try {
                                                    if (!log.new_values) return '-'
                                                    const parsed = JSON.parse(log.new_values)
                                                    return JSON.stringify(parsed)
                                                } catch {
                                                    return log.new_values
                                                }
                                            })()}
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