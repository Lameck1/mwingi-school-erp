import { useState, useEffect, useCallback } from 'react'
import {
    Users, BookOpen, Save, Loader2, UserPlus, Trash2
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore, useAuthStore } from '../../stores'

interface Staff {
    id: number
    first_name: string
    last_name: string
    staff_number: string
}

interface Subject {
    id: number
    code: string
    name: string
    curriculum: string
}

interface Stream {
    id: number
    stream_name: string
}

interface Allocation {
    id: number
    subject_id: number
    teacher_id: number
    subject_name?: string
    teacher_name?: string
}

export default function TeacherAllocation() {
    const { currentAcademicYear, currentTerm } = useAppStore()
    const { user } = useAuthStore()

    const [streams, setStreams] = useState<Stream[]>([])
    const [staff, setStaff] = useState<Staff[]>([])
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [allocations, setAllocations] = useState<Allocation[]>([])

    const [selectedStream, setSelectedStream] = useState<number>(0)
    const [selectedSubject, setSelectedSubject] = useState<number>(0)
    const [selectedTeacher, setSelectedTeacher] = useState<number>(0)

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const loadAllocations = useCallback(async () => {
        try {
            if (currentAcademicYear && currentTerm) {
                setLoading(true)
                const [allocationsData, streamsData, subjectsData] = await Promise.all([
                    window.electronAPI.getTeacherAllocations(
                        currentAcademicYear.id,
                        currentTerm.id,
                        selectedStream || undefined
                    ),
                    window.electronAPI.getStreams(),
                    window.electronAPI.getAcademicSubjects()
                ])

                setAllocations(allocationsData || [])
                setStreams(streamsData || [])
                setSubjects(subjectsData || [])
            }
        } catch (error) {
            console.error('Failed to load allocations:', error)
        } finally {
            setLoading(false)
        }
    }, [currentAcademicYear, currentTerm, selectedStream])

    const loadInitialData = useCallback(async () => {
        try {
            const [staffData] = await Promise.all([
                window.electronAPI.getStaff(),
            ])
            setStaff(staffData)
        } catch (error) {
            console.error('Failed to load initial data:', error)
        }
    }, [])

    useEffect(() => {
        loadInitialData()
    }, [loadInitialData])

    useEffect(() => {
        loadAllocations()
    }, [loadAllocations])

    const handleAllocate = async () => {
        if (!currentAcademicYear || !currentTerm || !selectedStream || !selectedSubject || !selectedTeacher || !user) {
            alert('Please select class, subject and teacher')
            return
        }

        setSaving(true)
        try {
            await window.electronAPI.allocateTeacher({
                academic_year_id: currentAcademicYear.id,
                term_id: currentTerm.id,
                stream_id: selectedStream,
                subject_id: selectedSubject,
                teacher_id: selectedTeacher
            }, user.id)

            // Refresh allocations list
            await loadAllocations()

            // Reset selection
            setSelectedSubject(0)
            setSelectedTeacher(0)
        } catch (error) {
            console.error('Failed to allocate teacher:', error)
            alert('Failed to save allocation')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Teacher Allocations"
                subtitle="Assign teachers to subjects for specific classes"
                breadcrumbs={[{ label: 'Academics' }, { label: 'Allocations' }]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Allocation Form */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="premium-card space-y-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-primary" />
                            New Allocation
                        </h3>

                        <div className="space-y-4">
                            <Select
                                label="Class / Stream"
                                value={selectedStream}
                                onChange={(val) => setSelectedStream(Number(val))}
                                options={[
                                    { value: 0, label: 'Select class...' },
                                    ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                                ]}
                            />

                            <Select
                                label="Subject"
                                value={selectedSubject}
                                onChange={(val) => setSelectedSubject(Number(val))}
                                options={[
                                    { value: 0, label: 'Select subject...' },
                                    ...subjects.map(s => ({ value: s.id, label: `${s.name} (${s.curriculum})` }))
                                ]}
                            />

                            <Select
                                label="Teacher"
                                value={selectedTeacher}
                                onChange={(val) => setSelectedTeacher(Number(val))}
                                options={[
                                    { value: 0, label: 'Select teacher...' },
                                    ...staff.map(s => ({ value: s.id, label: `${s.first_name} ${s.last_name}` }))
                                ]}
                            />

                            <button
                                onClick={handleAllocate}
                                disabled={saving || !selectedStream || !selectedSubject || !selectedTeacher}
                                className="w-full btn btn-primary flex items-center justify-center gap-2 py-3 mt-4"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Allocation
                            </button>
                        </div>
                    </div>
                </div>

                {/* Current Allocations List */}
                <div className="lg:col-span-2">
                    <div className="premium-card min-h-[400px]">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            Current Allocations
                        </h3>

                        {!selectedStream ? (
                            <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                                <Users className="w-12 h-12 opacity-20" />
                                <p>Select a class to view its allocations</p>
                            </div>
                        ) : loading ? (
                            <div className="flex items-center justify-center h-64 text-foreground/40">
                                <Loader2 className="w-8 h-8 animate-spin" />
                            </div>
                        ) : allocations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                                <p>No subjects allocated for this class yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="pb-3 font-bold text-foreground/60">Subject</th>
                                            <th className="pb-3 font-bold text-foreground/60">Teacher</th>
                                            <th className="pb-3 font-bold text-foreground/60 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {allocations.map(allocation => (
                                            <tr key={allocation.id} className="group">
                                                <td className="py-4 font-medium text-white">{allocation.subject_name}</td>
                                                <td className="py-4 text-foreground/80">{allocation.teacher_name}</td>
                                                <td className="py-4 text-right">
                                                    <button className="p-2 text-foreground/30 hover:text-destructive transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
