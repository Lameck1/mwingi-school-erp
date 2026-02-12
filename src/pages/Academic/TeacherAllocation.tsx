import {
    Users, BookOpen, Save, Loader2, UserPlus, Trash2
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../contexts/ToastContext'
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
    const { showToast } = useToast()

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
                    globalThis.electronAPI.getTeacherAllocations(
                        currentAcademicYear.id,
                        currentTerm.id,
                        selectedStream || undefined
                    ),
                    globalThis.electronAPI.getStreams(),
                    globalThis.electronAPI.getAcademicSubjects()
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
            const staffData = await globalThis.electronAPI.getStaff()
            setStaff(staffData)
        } catch (error) {
            console.error('Failed to load initial data:', error)
        }
    }, [])

    useEffect(() => {
        loadInitialData().catch((err: unknown) => console.error('Failed to load initial data:', err))
    }, [loadInitialData])

    useEffect(() => {
        loadAllocations().catch((err: unknown) => console.error('Failed to load allocations:', err))
    }, [loadAllocations])

    const handleAllocate = async () => {
        if (!currentAcademicYear || !currentTerm || !selectedStream || !selectedSubject || !selectedTeacher || !user) {
            showToast('Please select class, subject and teacher', 'warning')
            return
        }

        setSaving(true)
        try {
            await globalThis.electronAPI.allocateTeacher({
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
            showToast('Teacher allocated successfully', 'success')
        } catch (error) {
            console.error('Failed to allocate teacher:', error)
            showToast('Failed to save allocation', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteAllocation = async (allocationId: number) => {
        if (!user) return
        try {
            await globalThis.electronAPI.deleteTeacherAllocation(allocationId, user.id)
            await loadAllocations()
            showToast('Allocation removed', 'success')
        } catch (error) {
            console.error('Failed to delete allocation:', error)
            showToast('Failed to remove allocation', 'error')
        }
    }

    const renderAllocationsContent = () => {
        if (!selectedStream) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                    <Users className="w-12 h-12 opacity-20" />
                    <p>Select a class to view its allocations</p>
                </div>
            )
        }

        if (loading) {
            return (
                <div className="flex items-center justify-center h-64 text-foreground/40">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            )
        }

        if (allocations.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                    <p>No subjects allocated for this class yet</p>
                </div>
            )
        }

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="pb-3 font-bold text-foreground/60">Subject</th>
                            <th className="pb-3 font-bold text-foreground/60">Teacher</th>
                            <th className="pb-3 font-bold text-foreground/60 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {allocations.map(allocation => (
                            <tr key={allocation.id} className="group">
                                <td className="py-4 font-medium text-foreground">{allocation.subject_name}</td>
                                <td className="py-4 text-foreground/80">{allocation.teacher_name}</td>
                                <td className="py-4 text-right">
                                    <button
                                        onClick={() => handleDeleteAllocation(allocation.id)}
                                        className="p-2 text-foreground/30 hover:text-destructive transition-colors"
                                        aria-label="Remove allocation"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Teacher Allocations"
                subtitle="Assign teachers to subjects for specific classes"
                breadcrumbs={[{ label: 'Academics', href: '/academics' }, { label: 'Allocations' }]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Allocation Form */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="premium-card space-y-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
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
                        <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            Current Allocations
                        </h3>

                        {renderAllocationsContent()}
                    </div>
                </div>
            </div>
        </div>
    )
}
