import { useEffect, useState, useCallback } from 'react'
import { formatCurrency } from '../../utils/format'
import { Plus, UserCog, Edit, Trash2, ShieldCheck, Phone } from 'lucide-react'
import { StaffMember } from '../../types/electron-api/StaffAPI'
import { useToast } from '../../contexts/ToastContext'
import { Modal } from '../../components/ui/Modal'

export default function Staff() {
    const { showToast } = useToast()
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)

    const loadStaff = useCallback(async () => {
        try {
            const data = await window.electronAPI.getStaff()
            setStaff(data)
        } catch (error) {
            console.error('Failed to load staff:', error)
            showToast('Failed to synchronize staff directory', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { loadStaff() }, [loadStaff])




    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Staff Management</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Oversee educational and administrative personnel records</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                >
                    <Plus className="w-5 h-5" />
                    <span>Enlist New Staff</span>
                </button>
            </div>

            <div className="card overflow-hidden transition-all duration-300">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Synchronizing Directory...</p>
                    </div>
                ) : staff.length === 0 ? (
                    <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                        <UserCog className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-foreground/80 font-heading">Empty Registry</h3>
                        <p className="text-foreground/40 font-medium italic mb-6">No staff entities identified in the institutional database</p>
                        <button onClick={() => setShowModal(true)} className="btn btn-secondary border-2 border-dashed px-8">Add First Member</button>
                    </div>
                ) : (
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
                                {staff.map((s) => (
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
                                            <span className="text-sm font-bold text-foreground/80">{formatCurrency(s.basic_salary || 0)}</span>
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${s.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/10' : 'bg-destructive/10 text-destructive border-destructive/20'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
                                                {s.is_active ? 'VERIFIED' : 'SUSPENDED'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-2.5 bg-background border border-border/40 hover:border-blue-500/50 hover:text-blue-500 rounded-xl transition-all shadow-sm">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button className="p-2.5 bg-background border border-border/40 hover:border-destructive/50 hover:text-destructive rounded-xl transition-all shadow-sm">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Staff Entity Registration"
                size="sm"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-4">
                        <ShieldCheck className="w-10 h-10 text-primary opacity-40 shrink-0" />
                        <p className="text-xs font-medium text-foreground/60 leading-relaxed uppercase tracking-tight">
                            You are initiating the registration of a new staff entity. Ensure all identity certifications and credentials correspond to official personnel files.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <p className="text-sm font-bold text-foreground/40 italic text-center py-8 border-2 border-dashed border-border/20 rounded-2xl">
                            Staff registration sequence is currently pending interface finalization.
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                            <button onClick={() => setShowModal(false)} className="btn btn-secondary px-6">Discard</button>
                            <button onClick={() => setShowModal(false)} className="btn btn-primary px-8">Confirm Sequence</button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
