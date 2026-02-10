import { Download, Upload, CheckCircle, Loader2, Database, ShieldAlert, History, FileStack, HardDrive } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { useToast } from '../../contexts/ToastContext'

export default function Backup() {
    const { showToast } = useToast()
    const [backing, setBacking] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    const [backups, setBackups] = useState<Array<{ filename: string; size: number; created_at: Date }>>([])

    const loadBackups = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getBackupList()
            setBackups(data)
        } catch (error) {
            console.error('Failed to load backups:', error)
        }
    }, [])

    useEffect(() => {
        void loadBackups()
    }, [loadBackups])

    const handleBackup = async () => {
        setBacking(true)
        setResult(null)
        try {
            const res = await globalThis.electronAPI.createBackup()
            if (res.cancelled) {
                setResult(null)
            } else if (res.success) {
                const msg = `Snapshot synchronized to storage path: ${res.path}`
                setResult({ type: 'success', message: msg })
                showToast('Database snapshot established', 'success')
                void loadBackups()
            } else {
                setResult({ type: 'error', message: 'Synchronization sequence failed' })
                showToast('Backup orchestration failed', 'error')
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Critical synchronization failure'
            setResult({ type: 'error', message: msg })
            showToast('Backup orchestration failed', 'error')
        } finally { setBacking(false) }
    }

    const handleRestore = async (filename?: string) => {
        if (!confirm('CRITICAL: This will overwrite all active environmental data. This action is irreversible. Proceed?')) {return}

        if (!filename) {
            showToast('Identify a source artifact for restoration', 'error')
            return
        }

        setRestoring(true)
        setResult(null)
        try {
            const res = await globalThis.electronAPI.restoreBackup(filename)
            if (res.cancelled) {
                setResult(null)
            } else if (res.success) {
                setResult({ type: 'success', message: res.message || 'System state restored successfully' })
                showToast('Environment restoration complete', 'success')
            } else {
                setResult({ type: 'error', message: 'Restore sequence failed' })
                showToast('Restoration orchestration failed', 'error')
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Critical restoration failure'
            setResult({ type: 'error', message: msg })
            showToast('Restoration orchestration failed', 'error')
        } finally { setRestoring(false) }
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Backup & Disaster Recovery</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Safeguard institutional data through cryptographic snapshots and restoration protocols</p>
                </div>
                <div className="flex items-center gap-3 bg-emerald-500/5 p-2 px-4 rounded-xl border border-emerald-500/20">
                    <Database className="w-5 h-5 text-emerald-500/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60">Primary Database Online</span>
                </div>
            </div>

            {result && (
                <div className={`p-5 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-300 border shadow-lg ${result.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/5'
                    : 'bg-destructive/10 text-destructive border-destructive/20 shadow-destructive/5'
                    }`}>
                    <CheckCircle className="w-6 h-6 shrink-0" />
                    <span className="font-bold text-sm tracking-tight">{result.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Backup Module */}
                <div className="premium-card group overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Download className="w-32 h-32 -rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                                <Download className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground font-heading">Synchronize Snapshot</h2>
                                <p className="text-sm text-foreground/40 font-medium">Export environment state to localized storage</p>
                            </div>
                        </div>
                        <p className="text-foreground/60 font-medium mb-8 leading-relaxed italic border-l-2 border-primary/20 pl-4 uppercase text-[11px] tracking-wider">
                            Generates a comprehensive system snapshot including student records, financial ledgers, staff credentials, and architectural configurations.
                        </p>
                        <button
                            onClick={handleBackup}
                            disabled={backing}
                            className="btn btn-primary w-full flex items-center justify-center gap-3 py-5 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-[0.98]"
                        >
                            {backing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            <span>{backing ? 'ORCHESTRATING SYNCHRONIZATION...' : 'INITIALIZE DATABASE SNAPSHOT'}</span>
                        </button>
                    </div>
                </div>

                {/* Restore Module */}
                <div className="premium-card group overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Upload className="w-32 h-32 rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500 shadow-inner">
                                <Upload className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold font-heading text-orange-500/80">Protocol Restoration</h2>
                                <p className="text-sm text-foreground/40 font-medium">Inject snapshot data into active environment</p>
                            </div>
                        </div>
                        <p className="text-foreground/60 font-medium mb-8 leading-relaxed italic border-l-2 border-orange-500/20 pl-4 uppercase text-[11px] tracking-wider">
                            Restore environment state from a verified historical snapshot. <strong className="text-destructive">System alert:</strong> This protocol will overwrite all current system data.
                        </p>
                        <div className="p-4 bg-orange-500/5 text-orange-500 border border-orange-500/20 rounded-xl flex gap-3 text-xs font-bold leading-relaxed shadow-inner">
                            <ShieldAlert className="w-5 h-5 shrink-0" />
                            <span>TO RESTORE, IDENTIFY A VERIFIED ARTIFACT FROM THE CHRONOLOGICAL HISTORY LIST BELOW.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Backup History Table */}
            <div className="card overflow-hidden">
                <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/10">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-primary opacity-60" />
                        <h2 className="text-lg font-bold text-foreground font-heading">Historical Artifacts</h2>
                    </div>
                    <button
                        onClick={loadBackups}
                        className="btn btn-secondary py-1.5 px-4 text-[10px] font-bold uppercase tracking-widest border border-border/40 hover:bg-primary/5 hover:text-primary transition-all"
                    >
                        Force Refresh
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr className="border-b border-border/40">
                                <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 px-6">Artifact Identifier</th>
                                <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Data Magnitude</th>
                                <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Synchronization Timestamp</th>
                                <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-right px-8">Restoration Access</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                            {backups.map((b) => (
                                <tr key={b.filename} className="group hover:bg-secondary/20 transition-colors">
                                    <td className="py-4 px-6 flex items-center gap-3">
                                        <FileStack className="w-4 h-4 text-primary/40 group-hover:text-primary/100 transition-colors" />
                                        <span className="font-mono text-xs text-foreground/80 tracking-tight">{b.filename}</span>
                                    </td>
                                    <td className="py-4">
                                        <span className="text-xs font-bold text-foreground/60">{(b.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </td>
                                    <td className="py-4">
                                        <span className="text-xs font-medium text-foreground/40 italic">
                                            {new Date(b.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right px-8">
                                        <button
                                            onClick={() => handleRestore(b.filename)}
                                            disabled={restoring}
                                            className="px-4 py-2 bg-orange-500/10 text-orange-500 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 shadow-sm"
                                        >
                                            Instate Snapshot
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {backups.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-24 text-center">
                                        <FileStack className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground/30">Void History: No artifacts discovered</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-8 bg-secondary/10 border-t border-border/40">
                    <h3 className="text-[10px] font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">Environment Integrity Guidelines</h3>
                    <div className="flex flex-col sm:flex-row gap-8">
                        <div className="flex-1 flex gap-4 p-4 bg-background/50 rounded-2xl border border-border/40">
                            <HardDrive className="w-8 h-8 text-primary opacity-40 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-foreground/80 mb-1">Local Synchronization Path</p>
                                <p className="text-[10px] font-mono font-medium text-foreground/40 break-all leading-relaxed uppercase tracking-tighter">
                                    {`%APPDATA%\\mwingi-school-erp\\backups`}
                                </p>
                            </div>
                        </div>
                        <div className="flex-1 flex gap-4 p-4 bg-background/50 rounded-2xl border border-border/40">
                            <ShieldAlert className="w-8 h-8 text-emerald-500 opacity-40 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-emerald-500/80 mb-1">Snapshot Protocol Recommendation</p>
                                <p className="text-[10px] font-medium text-foreground/40 leading-relaxed italic">
                                    Initialize snapshots before major administrative operations or data alterations. Artifact verification is recommended post-synchronization.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
