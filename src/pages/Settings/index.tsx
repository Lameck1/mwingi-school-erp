import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Save, Loader2, School, Calendar, CreditCard, Globe, MessageSquare, Plus, CheckCircle2, Database, AlertTriangle } from 'lucide-react'
import IntegrationsSettings from './Integrations'
import MessageTemplates from './MessageTemplates'
import { useToast } from '../../contexts/ToastContext'
import { Modal } from '../../components/ui/Modal'
import { AcademicYear } from '../../types/electron-api/AcademicAPI'
import { SchoolSettings } from '../../types/electron-api/SettingsAPI'

export default function Settings() {
    const { schoolSettings, setSchoolSettings } = useAppStore()
    const { showToast } = useToast()
    const [activeTab, setActiveTab] = useState('school')
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
        school_name: '', school_motto: '', school_address: '', school_phone: '', school_email: '', school_website: '',
        currency: '', timezone: '', date_format: '',
        sms_api_key: '', sms_api_secret: '', sms_sender_id: '', mpesa_paybill: ''
    })

    useEffect(() => {
        if (schoolSettings) {
            setFormData({
                school_name: schoolSettings.school_name || '',
                school_motto: schoolSettings.school_motto || '',
                school_address: schoolSettings.school_address || '',
                school_phone: schoolSettings.school_phone || '',
                school_email: schoolSettings.school_email || '',
                school_website: schoolSettings.school_website || '',
                currency: schoolSettings.currency || '',
                timezone: schoolSettings.timezone || '',
                date_format: schoolSettings.date_format || 'DD/MM/YYYY',
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
            const years = await window.electronAPI.getAcademicYears()
            setAcademicYears(years)
        } catch (error) {
            showToast('Failed to load academic cycles', 'error')
        } finally {
            setLoadingYears(false)
        }
    }, [showToast])

    useEffect(() => {
        if (activeTab === 'academic') {
            loadAcademicYears()
        }
    }, [activeTab, loadAcademicYears])

    const handleSave = async () => {
        setSaving(true)
        try {
            await window.electronAPI.updateSettings(formData)
            const updated = await window.electronAPI.getSettings()
            setSchoolSettings(updated as unknown as SchoolSettings)
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
            await window.electronAPI.createAcademicYear(newYearData)
            showToast('Academic cycle established successfully', 'success')
            setShowYearModal(false)
            setNewYearData({ year_name: '', start_date: '', end_date: '', is_current: false })
            loadAcademicYears()
        } catch (error) {
            showToast('Failed to create academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleActivateYear = async (id: number) => {
        setSaving(true)
        try {
            await window.electronAPI.activateAcademicYear(id)
            showToast('Academic session activated successfully', 'success')
            loadAcademicYears()
        } catch (error) {
            showToast('Failed to activate academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    const tabs = [
        { id: 'school', label: 'School Info', icon: School },
        { id: 'academic', label: 'Academic Year', icon: Calendar },
        { id: 'payment', label: 'Payment Settings', icon: CreditCard },
        { id: 'integrations', label: 'Integrations', icon: Globe },
        { id: 'templates', label: 'Message Templates', icon: MessageSquare },
        { id: 'maintenance', label: 'System Maintenance', icon: Database },
    ]

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">System Settings</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Configure core architectural and environmental parameters</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>{saving ? 'Synchronizing...' : 'Commit Changes'}</span>
                </button>
            </div>

            <div className="flex flex-col xl:flex-row gap-8">
                {/* Sidebar Navigation - Breaks earlier for mobile */}
                <div className="w-full xl:w-64 shrink-0">
                    <nav className="flex xl:flex-col overflow-x-auto xl:overflow-visible no-scrollbar p-2 bg-secondary/20 rounded-2xl border border-border/20">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all font-bold text-sm whitespace-nowrap xl:w-full ${activeTab === tab.id
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 translate-x-0 xl:translate-x-2'
                                    : 'text-foreground/60 hover:text-foreground hover:bg-secondary/40'
                                    }`}
                            >
                                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`} />
                                <span>{tab.label}</span>
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
                                        className="input w-full bg-secondary/30" placeholder="e.g. Mwingi Adventist School" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="school_motto">Operating Motto</label>
                                    <input id="school_motto" type="text" value={formData.school_motto}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_motto: e.target.value }))}
                                        className="input w-full bg-secondary/30" placeholder="e.g. Excellence in Service" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="address">Physical Address</label>
                                    <textarea id="address" value={formData.school_address}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_address: e.target.value }))}
                                        className="input w-full bg-secondary/30" rows={3} placeholder="Mwingi-Garissa Rd, Box 123..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="phone">Contact Hotline</label>
                                    <input id="phone" type="tel" value={formData.school_phone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_phone: e.target.value }))}
                                        className="input w-full bg-secondary/30" placeholder="+254 700 000000" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="email">Administrative Email</label>
                                    <input id="email" type="email" value={formData.school_email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, school_email: e.target.value }))}
                                        className="input w-full bg-secondary/30" placeholder="admin@school.ac.ke" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="currency">System Currency</label>
                                    <select id="currency" value={formData.currency}
                                        onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                                        className="input w-full bg-secondary/30">
                                        <option value="">Select Currency</option>
                                        <option value="KES">Kenya Shillings (KES)</option>
                                        <option value="USD">US Dollars (USD)</option>
                                        <option value="GBP">British Pounds (GBP)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="timezone">Timezone</label>
                                    <select id="timezone" value={formData.timezone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                                        className="input w-full bg-secondary/30">
                                        <option value="">Select Timezone</option>
                                        <option value="Africa/Nairobi">Nairobi (GMT+3)</option>
                                        <option value="UTC">UTC (Universal Time)</option>
                                    </select>
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
                                {loadingYears ? (
                                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary/40" /></div>
                                ) : academicYears.length === 0 ? (
                                    <div className="p-12 text-center border-2 border-dashed border-border/20 rounded-3xl">
                                        <Calendar className="w-12 h-12 text-foreground/5 mx-auto mb-4" />
                                        <p className="text-foreground/40 font-bold uppercase text-[10px] tracking-widest">No cycles established</p>
                                    </div>
                                ) : (
                                    academicYears.map(year => (
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
                                                    >
                                                        <Calendar className="w-3 h-3" />
                                                        Activate
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
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
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">M-PESA Paybill Number</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500/60 group-focus-within:text-emerald-500 transition-colors">
                                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                                        </div>
                                        <input type="text" value={formData.mpesa_paybill}
                                            onChange={(e) => setFormData(prev => ({ ...prev, mpesa_paybill: e.target.value }))}
                                            className="input w-full pl-12 bg-secondary/30 focus:bg-secondary/50" placeholder="e.g. 247247" />
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
                                <div className="p-8 bg-destructive/5 rounded-3xl border border-destructive/20 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-5">
                                        <AlertTriangle className="w-32 h-32 text-destructive" />
                                    </div>

                                    <h3 className="text-lg font-bold text-destructive flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        Destructive Operation: Global Data Reset
                                    </h3>
                                    <p className="text-sm text-foreground/60 font-medium leading-relaxed max-w-2xl mb-8">
                                        This utility will permanently erase all transaction history, students, invoices, and payroll data.
                                        It will then establish <strong>Year 2026, Term 1</strong> as the active session and populate it with a comprehensive set of professional-grade test data.
                                        <span className="text-destructive font-bold"> This action cannot be undone.</span>
                                    </p>

                                    <button
                                        onClick={async () => {
                                            if (confirm('CRITICAL WARNING: This will DESTRUCTIVELY reset your entire database and seed it with 2026 data. Are you absolutely sure?')) {
                                                setSaving(true)
                                                try {
                                                    const result = await window.electronAPI.resetAndSeedDatabase(1) // Assuming ID 1 for test
                                                    if (result.success) {
                                                        showToast('Environment reset and seeded for 2026 successfully!', 'success')
                                                        // Refresh global state
                                                        window.location.reload()
                                                    } else {
                                                        showToast(result.message, 'error')
                                                    }
                                                } catch (error) {
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
                                            ].map((item, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm font-medium text-foreground/60">
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
                                            ].map((item, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm font-medium text-foreground/60">
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
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Cycle Name</label>
                        <input
                            type="text"
                            className="input w-full bg-secondary/30"
                            placeholder="e.g. Academic Year 2025"
                            value={newYearData.year_name}
                            onChange={e => setNewYearData({ ...newYearData, year_name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Start Date</label>
                            <input
                                type="date"
                                title="Start Date"
                                className="input w-full bg-secondary/30"
                                value={newYearData.start_date}
                                onChange={e => setNewYearData({ ...newYearData, start_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">End Date</label>
                            <input
                                type="date"
                                title="End Date"
                                className="input w-full bg-secondary/30"
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
                        <button onClick={() => setShowYearModal(false)} className="btn btn-secondary px-6">Cancel</button>
                        <button
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
