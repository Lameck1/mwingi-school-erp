import { useState, useEffect, useCallback } from 'react'
import {
    CheckCircle, XCircle, Clock, AlertCircle, Users, Save, Loader2
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Select } from '../../components/ui/Select'
import { useAppStore, useAuthStore } from '../../stores'
import { Tooltip } from '../../components/ui/Tooltip'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface StudentEntry {
    student_id: number
    student_name: string
    admission_number: string
    status: AttendanceStatus
    notes: string
}

interface Stream {
    id: number
    stream_name: string
}

export default function Attendance() {
    const { currentAcademicYear, currentTerm } = useAppStore()
    const { user } = useAuthStore()

    const [streams, setStreams] = useState<Stream[]>([])
    const [selectedStream, setSelectedStream] = useState<number>(0)
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
    const [students, setStudents] = useState<StudentEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, excused: 0, total: 0 })

    useEffect(() => {
        loadStreams()
    }, [])

    useEffect(() => {
        if (selectedStream && currentAcademicYear && currentTerm) {
            loadStudents()
        }
    }, [selectedStream, selectedDate, currentAcademicYear, currentTerm, loadStudents])

    const loadStreams = async () => {
        try {
            const data = await window.electronAPI.getStreams()
            setStreams(data)
        } catch (error) {
            console.error('Failed to load streams:', error)
        }
    }

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear || !currentTerm) return
        setLoading(true)
        try {
            // Get enrolled students
            const enrolled = await window.electronAPI.getStudentsForAttendance(
                selectedStream, currentAcademicYear.id, currentTerm.id
            )

            // Get existing attendance for this date
            const existing = await window.electronAPI.getAttendanceByDate(
                selectedStream, selectedDate, currentAcademicYear.id, currentTerm.id
            )

            // Map students with their existing status or default to PRESENT
            const existingMap = new Map(existing.map((e: unknown) => [e.student_id, e]))

            setStudents(enrolled.map((s: unknown) => {
                const ex = existingMap.get(s.student_id)
                return {
                    student_id: s.student_id,
                    student_name: s.student_name,
                    admission_number: s.admission_number,
                    status: (ex as unknown)?.status || 'PRESENT',
                    notes: (ex as unknown)?.notes || ''
                }
            }))

            // Update summary
            updateSummary(enrolled.map((s: unknown) => {
                const ex = existingMap.get(s.student_id)
                return (ex as unknown)?.status || 'PRESENT'
            }))
        } catch (error) {
            console.error('Failed to load students:', error)
        } finally {
            setLoading(false)
        }
    }, [selectedStream, selectedDate, currentAcademicYear, currentTerm])

    const updateSummary = (statuses: AttendanceStatus[]) => {
        setSummary({
            present: statuses.filter(s => s === 'PRESENT').length,
            absent: statuses.filter(s => s === 'ABSENT').length,
            late: statuses.filter(s => s === 'LATE').length,
            excused: statuses.filter(s => s === 'EXCUSED').length,
            total: statuses.length
        })
    }

    const setStatus = (studentId: number, status: AttendanceStatus) => {
        setStudents(prev => {
            const updated = prev.map(s =>
                s.student_id === studentId ? { ...s, status } : s
            )
            updateSummary(updated.map(s => s.status))
            return updated
        })
    }

    const markAllAs = (status: AttendanceStatus) => {
        setStudents(prev => {
            const updated = prev.map(s => ({ ...s, status }))
            updateSummary(updated.map(s => s.status))
            return updated
        })
    }

    const handleSave = async () => {
        if (!currentAcademicYear || !currentTerm || !user) return

        setSaving(true)
        try {
            const entries = students.map(s => ({
                student_id: s.student_id,
                status: s.status,
                notes: s.notes || undefined
            }))

            const result = await window.electronAPI.markAttendance(
                entries, selectedStream, selectedDate, currentAcademicYear.id, currentTerm.id, user.id
            )

            if (result.success) {
                alert(`Attendance saved for ${result.marked} students!`)
            } else {
                alert('Failed to save: ' + (result.errors?.join(', ') || 'Unknown error'))
            }
        } catch (error) {
            console.error('Failed to save attendance:', error)
            alert('Failed to save attendance')
        } finally {
            setSaving(false)
        }
    }

    const statusButtons: { status: AttendanceStatus; icon: any; label: string; color: string }[] = [
        { status: 'PRESENT', icon: CheckCircle, label: 'P', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
        { status: 'ABSENT', icon: XCircle, label: 'A', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
        { status: 'LATE', icon: Clock, label: 'L', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
        { status: 'EXCUSED', icon: AlertCircle, label: 'E', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    ]

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Attendance"
                subtitle="Mark daily student attendance"
                breadcrumbs={[{ label: 'Students' }, { label: 'Attendance' }]}
                actions={
                    <button
                        onClick={handleSave}
                        disabled={saving || students.length === 0}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Attendance
                    </button>
                }
            />

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Total" value={summary.total.toString()} icon={Users} color="from-slate-500/20 to-gray-500/20 text-slate-500" />
                <StatCard label="Present" value={summary.present.toString()} icon={CheckCircle} color="from-green-500/20 to-emerald-500/20 text-green-500" />
                <StatCard label="Absent" value={summary.absent.toString()} icon={XCircle} color="from-red-500/20 to-rose-500/20 text-red-500" />
                <StatCard label="Late" value={summary.late.toString()} icon={Clock} color="from-amber-500/20 to-orange-500/20 text-amber-500" />
                <StatCard label="Excused" value={summary.excused.toString()} icon={AlertCircle} color="from-blue-500/20 to-indigo-500/20 text-blue-500" />
            </div>

            {/* Filters */}
            <div className="premium-card">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select
                        label="Class"
                        value={selectedStream}
                        onChange={(val) => setSelectedStream(Number(val))}
                        options={[
                            { value: 0, label: 'Select class...' },
                            ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                        ]}
                        className="w-full"
                    />
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full bg-secondary/30 border border-border/40 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground/60">Quick Actions</label>
                        <div className="flex gap-2">
                            {statusButtons.map(btn => (
                                <Tooltip
                                    key={btn.status}
                                    content={`Mark all as ${btn.status.charAt(0) + btn.status.slice(1).toLowerCase()}`}
                                >
                                    <button
                                        onClick={() => markAllAs(btn.status)}
                                        className={`w-full py-2 rounded-lg text-xs font-bold border ${btn.color} hover:opacity-80 transition-opacity`}
                                    >
                                        All {btn.label}
                                    </button>
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Students List */}
            <div className="premium-card">
                {loading ? (
                    <div className="text-center py-16 text-foreground/40">Loading students...</div>
                ) : students.length === 0 ? (
                    <div className="text-center py-16 text-foreground/40">
                        {selectedStream ? 'No students found' : 'Select a class to mark attendance'}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {students.map(student => (
                            <div key={student.student_id} className="flex items-center justify-between p-4 bg-secondary/10 rounded-xl border border-border/30 hover:border-primary/20 transition-all duration-300">
                                <div>
                                    <p className="font-bold text-foreground">{student.student_name}</p>
                                    <p className="text-xs text-foreground/40 font-mono">{student.admission_number}</p>
                                </div>
                                <div className="flex gap-2">
                                    {statusButtons.map(btn => {
                                        const isActive = student.status === btn.status
                                        const Icon = btn.icon
                                        return (
                                            <Tooltip
                                                key={btn.status}
                                                content={`Mark as ${btn.status.charAt(0) + btn.status.slice(1).toLowerCase()}`}
                                            >
                                                <button
                                                    onClick={() => setStatus(student.student_id, btn.status)}
                                                    className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${isActive
                                                        ? btn.color + ' scale-110 shadow-lg'
                                                        : 'bg-secondary/40 border-border/20 text-foreground/30 hover:bg-secondary/60 hover:text-foreground/60'
                                                        }`}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                </button>
                                            </Tooltip>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

