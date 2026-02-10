import { Plus, UserCog, Edit, Trash2, ShieldCheck, Phone, CheckCircle2 } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { type StaffMember } from '../../types/electron-api/StaffAPI'
import { centsToShillings, formatCurrencyFromCents, shillingsToCents } from '../../utils/format'

export default function Staff() {
    const { showToast } = useToast()
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<StaffMember | null>(null)
    const [form, setForm] = useState({
        staff_number: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        phone: '',
        email: '',
        department: '',
        job_title: '',
        employment_date: '',
        basic_salary: '',
        is_active: true
    })

    const loadStaff = useCallback(async () => {
        try {
            const data = await window.electronAPI.getStaff(false)
            setStaff(data)
        } catch (error) {
            console.error('Failed to load staff:', error)
            showToast('Failed to synchronize staff directory', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { void loadStaff() }, [loadStaff])

    const resetForm = () => {
        setEditing(null)
        setForm({
            staff_number: '',
            first_name: '',
            middle_name: '',
            last_name: '',
            phone: '',
            email: '',
            department: '',
            job_title: '',
            employment_date: '',
            basic_salary: '',
            is_active: true
        })
    }

    const openCreate = () => {
        resetForm()
        setShowModal(true)
    }

    const openEdit = (member: StaffMember) => {
        setEditing(member)
        setForm({
            staff_number: member.staff_number || '',
            first_name: member.first_name || '',
            middle_name: member.middle_name || '',
            last_name: member.last_name || '',
            phone: member.phone || '',
            email: member.email || '',
            department: member.department || '',
            job_title: member.job_title || '',
            employment_date: member.employment_date || '',
            basic_salary: String(centsToShillings(member.basic_salary || 0)),
            is_active: Boolean(member.is_active)
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.staff_number.trim() || !form.first_name.trim() || !form.last_name.trim()) {
            showToast('Staff number, first name, and last name are required', 'error')
            return
        }
        setSaving(true)
        try {
            const payload = {
                staff_number: form.staff_number.trim(),
                first_name: form.first_name.trim(),
                middle_name: form.middle_name.trim() || undefined,
                last_name: form.last_name.trim(),
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                department: form.department.trim() || undefined,
                job_title: form.job_title.trim() || undefined,
                employment_date: form.employment_date || undefined,
                basic_salary: shillingsToCents(form.basic_salary || 0),
                is_active: form.is_active
            }

            if (editing) {
                await window.electronAPI.updateStaff(editing.id, payload)
                showToast('Staff record updated', 'success')
            } else {
                await window.electronAPI.createStaff(payload)
                showToast('Staff record created', 'success')
            }
            setShowModal(false)
            await loadStaff()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to save staff record', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (member: StaffMember, desired: boolean) => {
        if (!confirm(`${desired ? 'Activate' : 'Deactivate'} ${member.first_name} ${member.last_name}?`)) {return}
        setSaving(true)
        try {
            await window.electronAPI.setStaffActive(member.id, desired)
            await loadStaff()
            showToast(`Staff ${desired ? 'activated' : 'deactivated'}`, 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to update staff status', 'error')
        } finally {
            setSaving(false)
        }
    }




    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Staff Management</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Oversee educational and administrative personnel records</p>
                </div>
                <button
                    onClick={openCreate}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                >
                    <Plus className="w-5 h-5" />
                    <span>Enlist New Staff</span>
                </button>
            </div>

            <div className="card overflow-hidden transition-all duration-300">
                {(() => {
                    if (loading) {
                        return (
                            <div className="flex flex-col items-center justify-center py-24 gap-4">
                                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Synchronizing Directory...</p>
                            </div>
                        )
                    }

                    if (staff.length === 0) {
                        return (
                            <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                                <UserCog className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-foreground/80 font-heading">Empty Registry</h3>
                                <p className="text-foreground/40 font-medium italic mb-6">No staff entities identified in the institutional database</p>
                                <button onClick={openCreate} className="btn btn-secondary border-2 border-dashed px-8">Add First Member</button>
                            </div>
                        )
                    }

                    return (
                        <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr className="border-b border-border/40">
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Identity Number</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Legal Name</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Dept/Function</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Primary Contact</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Base Compensation</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Active Status</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-right px-6">Direct Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                {staff.map((s) => {
                                    const active = Boolean(s.is_active)
                                    return (
                                    <tr key={s.id} className="group hover:bg-secondary/20 transition-colors">
                                        <td className="py-4">
                                            <span className="font-mono text-xs font-bold text-primary/60">{s.staff_number}</span>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                                    {s.first_name[0]}
                                                </div>
                                                <span className="font-bold text-foreground">{s.first_name} {s.last_name}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div>
                                                <p className="text-sm font-semibold text-foreground/80">{s.job_title || '-'}</p>
                                                <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-tighter">{s.department || 'UNCATEGORIZED'}</p>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2 text-foreground/60 text-xs">
                                                <Phone className="w-3 h-3 opacity-40" />
                                                <span className="font-medium">{s.phone || 'NO CONTACT'}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <span className="text-sm font-bold text-foreground/80">{formatCurrencyFromCents(s.basic_salary || 0)}</span>
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/10' : 'bg-destructive/10 text-destructive border-destructive/20'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
                                                {active ? 'VERIFIED' : 'SUSPENDED'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openEdit(s)}
                                                    aria-label={`Edit staff record for ${s.first_name} ${s.last_name}`}
                                                    title={`Edit ${s.first_name} ${s.last_name}`}
                                                    className="p-2.5 bg-background border border-border/40 hover:border-blue-500/50 hover:text-blue-500 rounded-xl transition-all shadow-sm"
                                                >
                                                    <Edit className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                                {active ? (
                                                    <button
                                                        onClick={() => handleToggleActive(s, false)}
                                                        aria-label={`Deactivate ${s.first_name} ${s.last_name}`}
                                                        title={`Deactivate ${s.first_name} ${s.last_name}`}
                                                        className="p-2.5 bg-background border border-border/40 hover:border-destructive/50 hover:text-destructive rounded-xl transition-all shadow-sm"
                                                        disabled={saving}
                                                    >
                                                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleToggleActive(s, true)}
                                                        aria-label={`Activate ${s.first_name} ${s.last_name}`}
                                                        title={`Activate ${s.first_name} ${s.last_name}`}
                                                        className="p-2.5 bg-background border border-border/40 hover:border-emerald-500/50 hover:text-emerald-500 rounded-xl transition-all shadow-sm"
                                                        disabled={saving}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                    )
                })()}
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editing ? 'Edit Staff' : 'Staff Entity Registration'}
                size="sm"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-4">
                        <ShieldCheck className="w-10 h-10 text-primary opacity-40 shrink-0" />
                        <p className="text-xs font-medium text-foreground/60 leading-relaxed uppercase tracking-tight">
                            You are initiating the registration of a new staff entity. Ensure all identity certifications and credentials correspond to official personnel files.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="staff-number" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Staff Number *</label>
                            <input
                                id="staff-number"
                                type="text"
                                value={form.staff_number}
                                onChange={(e) => setForm(prev => ({ ...prev, staff_number: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. ST-001"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-first-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">First Name *</label>
                            <input
                                id="staff-first-name"
                                type="text"
                                value={form.first_name}
                                onChange={(e) => setForm(prev => ({ ...prev, first_name: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. Joseph"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-middle-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Middle Name</label>
                            <input
                                id="staff-middle-name"
                                type="text"
                                value={form.middle_name}
                                onChange={(e) => setForm(prev => ({ ...prev, middle_name: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="Optional"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-last-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Last Name *</label>
                            <input
                                id="staff-last-name"
                                type="text"
                                value={form.last_name}
                                onChange={(e) => setForm(prev => ({ ...prev, last_name: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. Omondi"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-phone" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Phone</label>
                            <input
                                id="staff-phone"
                                type="tel"
                                value={form.phone}
                                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="+254 7xx xxx xxx"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-email" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Email</label>
                            <input
                                id="staff-email"
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="name@school.ac.ke"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-department" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Department</label>
                            <input
                                id="staff-department"
                                type="text"
                                value={form.department}
                                onChange={(e) => setForm(prev => ({ ...prev, department: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. Academics"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-job-title" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Job Title</label>
                            <input
                                id="staff-job-title"
                                type="text"
                                value={form.job_title}
                                onChange={(e) => setForm(prev => ({ ...prev, job_title: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. Senior Teacher"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-employment-date" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Employment Date</label>
                            <input
                                id="staff-employment-date"
                                type="date"
                                value={form.employment_date}
                                onChange={(e) => setForm(prev => ({ ...prev, employment_date: e.target.value }))}
                                className="input w-full bg-secondary/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="staff-basic-salary" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">Base Salary (KES)</label>
                            <input
                                id="staff-basic-salary"
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.basic_salary}
                                onChange={(e) => setForm(prev => ({ ...prev, basic_salary: e.target.value }))}
                                className="input w-full bg-secondary/30"
                                placeholder="e.g. 50000"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/20 p-4 bg-secondary/10">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Active Status</p>
                            <p className="text-xs text-foreground/40">Inactive staff are hidden from allocations</p>
                        </div>
                        <button
                            onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${form.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}
                        >
                            {form.is_active ? 'Active' : 'Inactive'}
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                        <button onClick={() => setShowModal(false)} className="btn btn-secondary px-6">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary px-8">
                            {editing ? 'Update Staff' : 'Create Staff'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
