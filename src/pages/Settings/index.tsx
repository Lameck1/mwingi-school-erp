import { Save, Loader2, School, Calendar, CreditCard, Globe, MessageSquare, Plus, CheckCircle2, Database, AlertTriangle } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

import IntegrationsSettings from './Integrations'
import MessageTemplates from './MessageTemplates'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { useScrollableTabNav } from '../../hooks/useScrollableTabNav'
import { useAppStore, useAuthStore } from '../../stores'
import { type AcademicYear } from '../../types/electron-api/AcademicAPI'

export default function Settings() {
    const { schoolSettings, setSchoolSettings } = useAppStore()
    const { user } = useAuthStore()
    const { showToast } = useToast()
    const [activeTab, setActiveTab] = useState('school')
    const stableSetActiveTab = useCallback((tab: string) => setActiveTab(tab), [])
    const { navRef, handleTabClick } = useScrollableTabNav(stableSetActiveTab)
    const [saving, setSaving] = useState(false)
    const [loadingYears, setLoadingYears] = useState(false)
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [showYearModal, setShowYearModal] = useState(false)
    const [newYearData, setNewYearData] = useState({
        year_name: '',
        start_date: '',
        end_date: '',
        is_current: false
    })

    const [formData, setFormData] = useState({
        school_name: '',
        school_motto: '',
        address: '',
        phone: '',
        email: '',
        sms_api_key: '',
        sms_api_secret: '',
        sms_sender_id: '',
        mpesa_paybill: ''
    })

    useEffect(() => {
        if (schoolSettings) {
            setFormData({
                school_name: schoolSettings.school_name || '',
                school_motto: schoolSettings.school_motto || '',
                address: schoolSettings.address || '',
                phone: schoolSettings.phone || '',
                email: schoolSettings.email || '',
                sms_api_key: schoolSettings.sms_api_key || '',
                sms_api_secret: schoolSettings.sms_api_secret || '',
                sms_sender_id: schoolSettings.sms_sender_id || '',
                mpesa_paybill: schoolSettings.mpesa_paybill || ''
            })
        }
    }, [schoolSettings])

    const loadAcademicYears = useCallback(async () => {
        setLoadingYears(true)
        try {
            const years = await globalThis.electronAPI.getAcademicYears()
            setAcademicYears(years)
        } catch {
            showToast('Failed to load academic cycles', 'error')
        } finally {
            setLoadingYears(false)
        }
    }, [showToast])

    useEffect(() => {
        if (activeTab === 'academic') {
            loadAcademicYears().catch((err: unknown) => console.error('Failed to load academic years', err))
        }
    }, [activeTab, loadAcademicYears])

    const handleSave = async () => {
        setSaving(true)
        try {
            await globalThis.electronAPI.updateSettings(formData)
            const updated = await globalThis.electronAPI.getSettings()
            setSchoolSettings(updated)
            showToast('School settings synchronized successfully', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Critical error updating settings', 'error')
        } finally { setSaving(false) }
    }

    const handleCreateYear = async () => {
        if (!newYearData.year_name || !newYearData.start_date || !newYearData.end_date) {
            showToast('Please fill in all required fields', 'error')
            return
        }
        setSaving(true)
        try {
            await globalThis.electronAPI.createAcademicYear(newYearData)
            showToast('Academic cycle established successfully', 'success')
            setShowYearModal(false)
            setNewYearData({ year_name: '', start_date: '', end_date: '', is_current: false })
            await loadAcademicYears()
        } catch {
            showToast('Failed to create academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleActivateYear = async (id: number) => {
        setSaving(true)
        try {
            await globalThis.electronAPI.activateAcademicYear(id)
            showToast('Academic session activated successfully', 'success')
            await loadAcademicYears()
        } catch {
            showToast('Failed to activate academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    // handleTabClick is now provided by useScrollableTabNav hook

    const tabs = [
        { id: 'school', label: 'School Info', icon: School },
        { id: 'academic', label: 'Academic Year', icon: Calendar },
        { id: 'payment', label: 'Payment Settings', icon: CreditCard },
        { id: 'integrations', label: 'Integrations', icon: Globe },
        { id: 'templates', label: 'Message Templates', icon: MessageSquare },
        { id: 'maintenance', label: 'System Maintenance', icon: Database },
    ]

    const renderAcademicYears = (): JSX.Element => {
        if (loadingYears) {
            return (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary/40" /></div>
            )
        }

        if (academicYears.length === 0) {
            return (
                <div className="p-6 md:p-12 text-center border-2 border-dashed border-border/20 rounded-3xl">
                    <Calendar className="w-12 h-12 text-foreground/5 mx-auto mb-4" />
                    <p className="text-foreground/40 font-bold uppercase text-[10px] tracking-widest">No cycles established</p>
                </div>
            )
        }

        return (
            <>
                {academicYears.map(year => (
                    <div key={year.id} className="p-6 bg-secondary/10 border border-border/20 rounded-2xl flex justify-between items-center group hover:bg-secondary/20 transition-all border-l-4 border-l-primary/40">
                        <div>
                            <p className="font-bold text-foreground text-lg">{year.year_name}</p>
                            <p className="text-xs text-foreground/40 font-medium mt-1">
                                {new Date(year.start_date).toLocaleDateString()} — {new Date(year.end_date).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {year.is_current ? (
                                <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Active Session
                                </span>
                            ) : (
                                <button
                                    onClick={() => handleActivateYear(year.id)}
                                    disabled={saving}
                                    className="px-4 py-1.5 bg-secondary/30 text-foreground/40 hover:text-primary hover:bg-primary/5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-border/20 transition-all flex items-center gap-2"
                                    type="button"
                                >
                                    <Calendar className="w-3 h-3" />
                                    Activate
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="System Settings"
                subtitle="Configure core architectural and environmental parameters"
                actions={
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span>{saving ? 'Synchronizing...' : 'Commit Changes'}</span>
                    </button>
                }
            />

            <div className="flex flex-col xl:flex-row gap-8">
                {/* Sidebar Navigation - scrollable row on mobile, vertical on xl */}
                <div className="w-full xl:w-64 shrink-0">
                    <nav ref={navRef} className="flex xl:flex-col overflow-x-auto xl:overflow-visible custom-scrollbar p-2 bg-secondary/20 rounded-2xl border border-border/20 scroll-smooth snap-x snap-mandatory xl:snap-none">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                data-tab={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className={`flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all font-bold text-sm whitespace-nowrap xl:w-full snap-start ${activeTab === tab.id
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 translate-x-0 xl:translate-x-2'
                                    : 'text-foreground/60 hover:text-foreground hover:bg-secondary/40'
                                    }`}
                            >
                                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`} />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    {activeTab === 'school' && (
                        <div className="card animate-slide-up">
                            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <School className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground font-heading">Identity & Localization</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_name">Official School Name *</label>
                                    <input id="school_name" type="text" value={formData.school_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                                        className="input w-full" placeholder="e.g. Mwingi Adventist School" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_motto">Operating Motto</label>
                                    <input id="school_motto" type="text" value={formData.school_motto}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_motto: e.target.value }))}
                                        className="input w-full" placeholder="e.g. Excellence in Service" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="address">Physical Address</label>
                                    <textarea id="address" value={formData.address}
                                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                        className="input w-full" rows={3} placeholder="Mwingi-Garissa Rd, Box 123..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="phone">Contact Hotline</label>
                                    <input id="phone" type="tel" value={formData.phone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                        className="input w-full" placeholder="+254 700 000000" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="email">Administrative Email</label>
                                    <input id="email" type="email" value={formData.email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        className="input w-full" placeholder="admin@school.ac.ke" />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'academic' && (
                        <div className="card animate-slide-up">
                            <div className="flex items-center justify-between mb-8 pb-3 border-b border-border/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Calendar className="w-5 h-5 text-primary" />
                                    </div>
                                    <h2 className="text-xl font-bold text-foreground font-heading">Academic Cycles</h2>
                                </div>
                                <button
                                    onClick={() => setShowYearModal(true)}
                                    className="btn btn-primary flex items-center gap-2 py-2 px-4 text-xs"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>New Cycle</span>
                                </button>
                            </div>

                            <p className="text-foreground/40 font-medium italic mb-6 text-sm">Orchestrate academic years, schedules, and duration boundaries.</p>

                            <div className="space-y-4">
                                {renderAcademicYears()}
                            </div>

                            <button
                                onClick={() => setShowYearModal(true)}
                                className="btn btn-secondary mt-10 w-full py-5 border-dashed border-2 hover:border-primary/40 hover:bg-primary/5 text-foreground/40 transition-all font-bold uppercase tracking-[0.2em] text-[10px]"
                            >
                                + Establish New Academic Cycle
                            </button>
                        </div>
                    )}

                    {activeTab === 'payment' && (
                        <div className="card animate-slide-up">
                            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <CreditCard className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground font-heading">Financial Gateways</h2>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <label htmlFor="settings-mpesa-paybill" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">M-PESA Paybill Number</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500/60 group-focus-within:text-emerald-500 transition-colors">
                                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                                        </div>
                                        <input id="settings-mpesa-paybill" type="text" value={formData.mpesa_paybill}
                                            onChange={(e) => setFormData(prev => ({ ...prev, mpesa_paybill: e.target.value }))}
                                            className="input w-full pl-12" placeholder="e.g. 247247" />
                                    </div>
                                    <p className="text-[10px] text-foreground/30 font-medium ml-1 leading-relaxed">Official collection shortcode for M-PESA API automated reconciliation.</p>
                                </div>

                                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 border-dashed">
                                    <h4 className="text-xs font-bold text-primary mb-2 uppercase tracking-widest">Upcoming Gateway Support</h4>
                                    <div className="flex gap-4">
                                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">Stripe</div>
                                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">PayPal</div>
                                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">Pesapal</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'integrations' && <IntegrationsSettings />}

                    {activeTab === 'templates' && <MessageTemplates />}

                    {activeTab === 'maintenance' && (
                        <div className="card animate-slide-up bg-background">
                            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                                <div className="p-2 bg-destructive/10 rounded-lg">
                                    <Database className="w-5 h-5 text-destructive" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground font-heading uppercase tracking-tight">Data Integrity & Maintenance</h2>
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
                                        onClick={async () => {
                                            if (!confirm('This will divide inflated currency values by 100 for core finance tables. Continue?')) { return }
                                            if (!user?.id) {
                                                showToast('You must be signed in to run maintenance', 'error')
                                                return
                                            }
                                            setSaving(true)
                                            try {
                                                const result = await globalThis.electronAPI.normalizeCurrencyScale(user.id)
                                                if (result.success) {
                                                    showToast('Currency values normalized successfully.', 'success')
                                                    globalThis.location.reload()
                                                } else {
                                                    showToast(result.message, 'error')
                                                }
                                            } catch {
                                                showToast('Currency normalization failed', 'error')
                                            } finally {
                                                setSaving(false)
                                            }
                                        }}
                                        disabled={saving}
                                        className="btn bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-3 py-3 px-8 text-sm font-bold shadow-xl shadow-amber-500/20 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                                        <span>Normalize Currency Values</span>
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
                                        onClick={async () => {
                                            if (confirm('CRITICAL WARNING: This will DESTRUCTIVELY reset your entire database and seed it with 2026 data. Are you absolutely sure?')) {
                                                if (!user?.id) {
                                                    showToast('You must be signed in to run maintenance', 'error')
                                                    return
                                                }
                                                setSaving(true)
                                                try {
                                                    const result = await globalThis.electronAPI.resetAndSeedDatabase(user.id)
                                                    if (result.success) {
                                                        showToast(result.message || 'Environment reset and seeded for 2026 successfully!', 'success')
                                                        // Refresh global state after toast fires
                                                        setTimeout(() => globalThis.location.reload(), 600)
                                                    } else {
                                                        showToast(result.message, 'error')
                                                    }
                                                } catch {
                                                    showToast('Critical reset failure', 'error')
                                                } finally {
                                                    setSaving(false)
                                                }
                                            }
                                        }}
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
                                                'Sample Staff & Departmental Roster'
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
                    )}
                </div>
            </div>

            <Modal
                isOpen={showYearModal}
                onClose={() => setShowYearModal(false)}
                title="Establish New Academic Cycle"
                size="sm"
            >
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="new-year-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Cycle Name</label>
                        <input
                            id="new-year-name"
                            type="text"
                            className="input w-full"
                            placeholder="e.g. Academic Year 2025"
                            value={newYearData.year_name}
                            onChange={e => setNewYearData({ ...newYearData, year_name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="new-year-start-date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Start Date</label>
                            <input
                                id="new-year-start-date"
                                type="date"
                                title="Start Date"
                                className="input w-full"
                                value={newYearData.start_date}
                                onChange={e => setNewYearData({ ...newYearData, start_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="new-year-end-date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">End Date</label>
                            <input
                                id="new-year-end-date"
                                type="date"
                                title="End Date"
                                className="input w-full"
                                value={newYearData.end_date}
                                onChange={e => setNewYearData({ ...newYearData, end_date: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-secondary/20 rounded-xl border border-border/20">
                        <input
                            type="checkbox"
                            id="is_current"
                            className="w-4 h-4 rounded border-border/20 text-primary focus:ring-primary/20 bg-background"
                            checked={newYearData.is_current}
                            onChange={e => setNewYearData({ ...newYearData, is_current: e.target.checked })}
                        />
                        <label htmlFor="is_current" className="text-sm font-bold text-foreground/60 select-none">Set as Active Current Session</label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setShowYearModal(false)} className="btn btn-secondary px-6">Cancel</button>
                        <button
                            type="button"
                            onClick={handleCreateYear}
                            disabled={saving}
                            className="btn btn-primary px-8 flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>Create Cycle</span>
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

// Lazy load or separate file? Imported at top.
