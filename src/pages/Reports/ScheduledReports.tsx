import { useState, useEffect } from 'react'
import {
    Calendar, Clock, Mail, Plus, Edit, Trash2,
    FileText
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { useAuthStore } from '../../stores'

interface ScheduledReport {
    id: number
    report_name: string
    report_type: string
    schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
    day_of_week: number | null
    day_of_month: number | null
    time_of_day: string
    recipients: string // JSON
    is_active: boolean
    last_run_at: string | null
}

const REPORT_TYPES = [
    { value: 'FEE_COLLECTION', label: 'Fee Collection Summary' },
    { value: 'DEFAULTERS_LIST', label: 'Fee Defaulters List' },
    { value: 'EXPENSE_SUMMARY', label: 'Expense Summary' },
    { value: 'TRIAL_BALANCE', label: 'Trial Balance' },
    { value: 'STUDENT_LIST', label: 'Student List' },
]

export default function ScheduledReports() {
    const { user } = useAuthStore()

    const [schedules, setSchedules] = useState<ScheduledReport[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showModal, setShowModal] = useState(false)

    const [editingSchedule, setEditingSchedule] = useState<Partial<ScheduledReport>>({
        schedule_type: 'WEEKLY',
        day_of_week: 1, // Monday
        time_of_day: '08:00',
        recipients: JSON.stringify([]),
        is_active: true,
        report_type: 'FEE_COLLECTION'
    })

    const [recipientInput, setRecipientInput] = useState('')

    useEffect(() => {
        loadSchedules()
    }, [])

    const loadSchedules = async () => {
        setLoading(true)
        try {
            const data = await (window.electronAPI as unknown).getScheduledReports()
            setSchedules(data)
        } catch (error) {
            console.error('Failed to load schedules:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!user) return
        if (!editingSchedule.report_name) {
            alert('Report name is required')
            return
        }

        setSaving(true)
        try {
            if (editingSchedule.id) {
                await (window.electronAPI as unknown).updateScheduledReport(editingSchedule.id, editingSchedule, user.id)
            } else {
                await (window.electronAPI as unknown).createScheduledReport(editingSchedule, user.id)
            }
            setShowModal(false)
            loadSchedules()
        } catch (error) {
            alert('Failed to save schedule')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return

        try {
            await (window.electronAPI as unknown).deleteScheduledReport(id, user!.id)
            loadSchedules()
        } catch (error) {
            alert('Failed to delete schedule')
        }
    }

    const getRecipients = () => {
        try {
            return JSON.parse(editingSchedule.recipients || '[]')
        } catch {
            return []
        }
    }

    const addRecipient = () => {
        if (!recipientInput || !recipientInput.includes('@')) return
        const current = getRecipients()
        setEditingSchedule({
            ...editingSchedule,
            recipients: JSON.stringify([...current, recipientInput])
        })
        setRecipientInput('')
    }

    const removeRecipient = (email: string) => {
        const current = getRecipients()
        setEditingSchedule({
            ...editingSchedule,
            recipients: JSON.stringify(current.filter((e: string) => e !== email))
        })
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Scheduled Reports"
                subtitle="Automate report generation and email delivery"
                breadcrumbs={[{ label: 'Reports' }, { label: 'Scheduler' }]}
                actions={
                    <button
                        onClick={() => {
                            setEditingSchedule({
                                schedule_type: 'WEEKLY',
                                day_of_week: 1,
                                time_of_day: '08:00',
                                recipients: JSON.stringify([]),
                                is_active: true,
                                report_type: 'FEE_COLLECTION'
                            })
                            setShowModal(true)
                        }}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Schedule
                    </button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {schedules.map(schedule => (
                    <div key={schedule.id} className="premium-card group relative">
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => {
                                    setEditingSchedule(schedule)
                                    setShowModal(true)
                                }}
                                className="p-1.5 rounded bg-secondary/80 hover:bg-secondary text-foreground"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleDelete(schedule.id)}
                                className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{schedule.report_name}</h3>
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary/50 px-2 py-0.5 rounded text-foreground/50 border border-border/10">
                                    {REPORT_TYPES.find(t => t.value === schedule.report_type)?.label || schedule.report_type}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-foreground/60 mb-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="text-foreground font-medium">
                                    {schedule.schedule_type} • {schedule.time_of_day}
                                    {schedule.schedule_type === 'WEEKLY' && ` • ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][schedule.day_of_week!]}`}
                                    {schedule.schedule_type === 'MONTHLY' && ` • Day ${schedule.day_of_month}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-purple-400" />
                                <span>
                                    {(() => {
                                        try {
                                            return JSON.parse(schedule.recipients).length
                                        } catch { return 0 }
                                    })()} Recipients
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-border/10">
                            <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${schedule.is_active
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                }`}>
                                {schedule.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span className="text-[10px] text-foreground/40 font-medium italic">
                                Last Run: {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleDateString() : 'Never'}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Empty State */}
                {schedules.length === 0 && !loading && (
                    <div className="col-span-full text-center py-16 text-foreground/40 border border-dashed border-border/40 rounded-xl">
                        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>No scheduled reports found</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editingSchedule.id ? 'Edit Schedule' : 'New Schedule'}
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Schedule Name</label>
                        <input
                            type="text"
                            value={editingSchedule.report_name || ''}
                            onChange={(e) => setEditingSchedule({ ...editingSchedule, report_name: e.target.value })}
                            className="input w-full"
                            placeholder="e.g. Weekly Fee Summary"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Report Type</label>
                        <select
                            value={editingSchedule.report_type}
                            onChange={(e) => setEditingSchedule({ ...editingSchedule, report_type: e.target.value })}
                            className="input w-full"
                        >
                            {REPORT_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Frequency</label>
                            <select
                                value={editingSchedule.schedule_type}
                                onChange={(e) => setEditingSchedule({ ...editingSchedule, schedule_type: e.target.value as unknown })}
                                className="input w-full"
                            >
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Time</label>
                            <input
                                type="time"
                                value={editingSchedule.time_of_day}
                                onChange={(e) => setEditingSchedule({ ...editingSchedule, time_of_day: e.target.value })}
                                className="input w-full"
                            />
                        </div>
                    </div>

                    {editingSchedule.schedule_type === 'WEEKLY' && (
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Day of Week</label>
                            <div className="flex gap-2">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setEditingSchedule({ ...editingSchedule, day_of_week: i })}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${editingSchedule.day_of_week === i
                                            ? 'bg-primary text-primary-foreground shadow-lg scale-110'
                                            : 'bg-secondary text-foreground/60 hover:bg-secondary/80'
                                            }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Recipients</label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={recipientInput}
                                onChange={(e) => setRecipientInput(e.target.value)}
                                className="input flex-1"
                                placeholder="email@example.com"
                                onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                            />
                            <button onClick={addRecipient} className="btn btn-secondary px-3">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {getRecipients().map((email: string) => (
                                <span key={email} className="inline-flex items-center gap-2 bg-secondary/50 px-2 by-1 rounded-[6px] text-[10px] font-bold border border-border/10 text-foreground/60">
                                    {email}
                                    <button onClick={() => removeRecipient(email)} className="hover:text-destructive transition-colors duration-200">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                            {saving ? 'Saving...' : 'Save Schedule'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

