import { useState } from 'react'
import { Download, Upload, CheckCircle, Clock, Loader2 } from 'lucide-react'

export default function Backup() {
    const [backing, setBacking] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null)

    const handleBackup = async () => {
        setBacking(true)
        setResult(null)
        try {
            const res = await window.electronAPI.createBackup()
            if (res.cancelled) {
                setResult(null)
            } else if (res.success) {
                setResult({ type: 'success', message: `Backup saved to: ${res.path}` })
            } else {
                setResult({ type: 'error', message: 'Backup failed' })
            }
        } catch (error: any) {
            setResult({ type: 'error', message: error.message })
        } finally { setBacking(false) }
    }

    const handleRestore = async () => {
        if (!confirm('This will replace all current data. Are you sure?')) return
        setRestoring(true)
        setResult(null)
        try {
            const res = await window.electronAPI.restoreBackup()
            if (res.cancelled) {
                setResult(null)
            } else if (res.success) {
                setResult({ type: 'success', message: res.message || 'Restore completed successfully' })
            } else {
                setResult({ type: 'error', message: 'Restore failed' })
            }
        } catch (error: any) {
            setResult({ type: 'error', message: error.message })
        } finally { setRestoring(false) }
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Backup & Recovery</h1>
                <p className="text-gray-500 mt-1">Protect your data with regular backups</p>
            </div>

            {result && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    <CheckCircle className="w-5 h-5" />
                    <span>{result.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Backup */}
                <div className="card">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Download className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Create Backup</h2>
                            <p className="text-sm text-gray-500">Export database to a file</p>
                        </div>
                    </div>
                    <p className="text-gray-600 mb-4">
                        Create a backup of your entire database including all students, transactions, staff, and settings.
                    </p>
                    <button onClick={handleBackup} disabled={backing}
                        className="btn btn-primary w-full flex items-center justify-center gap-2">
                        {backing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        <span>{backing ? 'Creating Backup...' : 'Create Backup'}</span>
                    </button>
                </div>

                {/* Restore */}
                <div className="card">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <Upload className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Restore Backup</h2>
                            <p className="text-sm text-gray-500">Import from backup file</p>
                        </div>
                    </div>
                    <p className="text-gray-600 mb-4">
                        Restore your database from a previous backup. <strong className="text-red-600">Warning:</strong> This will replace all current data.
                    </p>
                    <button onClick={handleRestore} disabled={restoring}
                        className="btn btn-secondary w-full flex items-center justify-center gap-2 border-orange-300 text-orange-700 hover:bg-orange-50">
                        {restoring ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        <span>{restoring ? 'Restoring...' : 'Restore from Backup'}</span>
                    </button>
                </div>
            </div>

            {/* Backup History */}
            <div className="card mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Backup Tips</h2>
                <ul className="space-y-3 text-gray-600">
                    <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                        <span>Create backups regularly, ideally daily or before major changes</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                        <span>Store backups on an external drive or cloud storage for safety</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                        <span>Keep multiple backup versions (weekly, monthly)</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <Clock className="w-5 h-5 text-blue-500 mt-0.5" />
                        <span>Automatic scheduled backups coming soon</span>
                    </li>
                </ul>
            </div>
        </div>
    )
}
