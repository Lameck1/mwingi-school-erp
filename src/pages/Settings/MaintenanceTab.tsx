import { Loader2, Database, Calendar, AlertTriangle, Plus, CheckCircle2 } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'

interface MaintenanceTabProps {
    saving: boolean
    setSaving: (v: boolean) => void
}

export function MaintenanceTab({ saving, setSaving }: Readonly<MaintenanceTabProps>) {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    const handleNormalizeCurrency = async () => {
        if (!confirm('This will divide inflated currency values by 100 for core finance tables. Continue?')) { return }
        if (!user?.id) {
            showToast('You must be signed in to run maintenance', 'error')
            return
        }
        setSaving(true)
        try {
            const result = await globalThis.electronAPI.settings.normalizeCurrencyScale(user.id)
            if (result.success) {
                showToast('Currency values normalized successfully.', 'success')
                globalThis.location.reload()
            } else {
                showToast(result.error || result.message || 'Normalization failed', 'error')
            }
        } catch {
            showToast('Currency normalization failed', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleSeedExams = async () => {
        setSaving(true)
        try {
            const result = await globalThis.electronAPI.settings.seedExams()
            if (result.success) {
                showToast('Examination data seeded successfully!', 'success')
                setTimeout(() => globalThis.location.reload(), 600)
            } else {
                showToast(result.error || 'Seeding failed', 'error')
            }
        } catch {
            showToast('Critical seeding failure', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleResetAndSeed = async () => {
        if (!confirm('CRITICAL WARNING: This will DESTRUCTIVELY reset your entire database and seed it with 2026 data. Are you absolutely sure?')) { return }
        if (!user?.id) {
            showToast('You must be signed in to run maintenance', 'error')
            return
        }
        setSaving(true)
        try {
            const result = await globalThis.electronAPI.settings.resetAndSeedDatabase(user.id)
            if (result.success) {
                showToast(result.message || result.error || 'Environment reset and seeded for 2026 successfully!', 'success')
                setTimeout(() => globalThis.location.reload(), 600)
            } else {
                showToast(result.error || result.message || 'Reset failed', 'error')
            }
        } catch {
            showToast('Critical reset failure', 'error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="card animate-slide-up bg-background">
            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                <div className="p-2 bg-destructive/10 rounded-lg">
                    <Database className="w-5 h-5 text-destructive" />
                </div>
                <h2 className="text-xl font-bold text-foreground font-heading uppercase tracking-tight">Data Integrity &amp; Maintenance</h2>
            </div>

            <div className="space-y-8">
                <div className="p-6 bg-amber-500/5 rounded-3xl border border-amber-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Database className="w-20 h-20 text-amber-500" />
                    </div>
                    <h3 className="text-lg font-bold text-amber-500 flex items-center gap-2 mb-2">
                        <Database className="w-5 h-5" />
                        Repair Utility: Normalize Currency Scale
                    </h3>
                    <p className="text-sm text-foreground/60 font-medium leading-relaxed max-w-2xl mb-6">
                        Detects 100x currency scaling and normalizes core finance tables (fees, invoices, receipts, ledger).
                        This is safe to run if amounts look inflated by a factor of 100.
                    </p>
                    <button
                        onClick={handleNormalizeCurrency}
                        disabled={saving}
                        className="btn bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-3 py-3 px-8 text-sm font-bold shadow-xl shadow-amber-500/20 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                        <span>Normalize Currency Values</span>
                    </button>
                </div>
                <div className="p-4 md:p-8 bg-secondary/5 rounded-3xl border border-border/20 relative overflow-hidden mb-6">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Calendar className="w-32 h-32 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2 mb-2">
                        <Calendar className="w-5 h-5" />
                        Hydrate Examination Data
                    </h3>
                    <p className="text-sm text-foreground/60 font-medium leading-relaxed max-w-2xl mb-8">
                        Populate the current academic term with professional-grade CBC subjects, scheduled exams, and realistic student performance scores.
                        This is ideal for testing report cards, merit lists, and academic analytics.
                    </p>
                    <button
                        onClick={handleSeedExams}
                        disabled={saving}
                        className="btn bg-primary hover:bg-primary/90 text-white flex items-center gap-3 py-4 px-10 text-sm font-bold shadow-xl shadow-primary/10 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        <span>Seed Examination Data (CBC)</span>
                    </button>
                </div>
                <div className="p-4 md:p-8 bg-destructive/5 rounded-3xl border border-destructive/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <AlertTriangle className="w-32 h-32 text-destructive" />
                    </div>

                    <h3 className="text-lg font-bold text-destructive flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        Destructive Operation: Global Data Reset
                    </h3>
                    <p className="text-sm text-foreground/60 font-medium leading-relaxed max-w-2xl mb-8">
                        This utility will permanently erase all transaction history, students, invoices, and payroll data.
                        It will then establish <strong>Year 2026, Term 1</strong> as the active session and populate it with a comprehensive set of professional-grade test data.{' '}
                        <span className="text-destructive font-bold">This action cannot be undone.</span>
                    </p>

                    <button
                        onClick={handleResetAndSeed}
                        disabled={saving}
                        className="btn bg-destructive hover:bg-destructive/90 text-white flex items-center gap-3 py-4 px-10 text-sm font-bold shadow-2xl shadow-destructive/20 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                        <span>Initialize 2026 Test Environment</span>
                    </button>
                </div>

                {/* Feature Removed */}

                {/* Feature Removed */}

                {/* Feature Removed */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-secondary/10 rounded-2xl border border-border/20">
                        <h4 className="text-xs font-bold text-foreground/40 uppercase tracking-widest mb-4">Seeded Metadata</h4>
                        <ul className="space-y-3">
                            {[
                                'Academic Year 2026 (Active)',
                                '20 Fresh Student Profiles',
                                'Standardized 2026 Fee Structures',
                                'Opening Inventory Balances',
                                'Sample Staff & Departmental Roster',
                                'CBC Subjects & Examination Scores'
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-2 text-sm font-medium text-foreground/60">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500/60" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="p-6 bg-secondary/10 rounded-2xl border border-border/20">
                        <h4 className="text-xs font-bold text-foreground/40 uppercase tracking-widest mb-4">Preserved Configurations</h4>
                        <ul className="space-y-3">
                            {[
                                'Institutional Settings & Logo',
                                'System User Accounts',
                                'Class Streams and Levels',
                                'Statutory Tax/Pension Rates',
                                'API & SMS Integrations'
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-2 text-sm font-medium text-foreground/60">
                                    <CheckCircle2 className="w-4 h-4 text-primary/60" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
