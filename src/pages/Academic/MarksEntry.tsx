import { useState, useEffect } from 'react'
import {
    Save, Loader2, Search, AlertCircle, TrendingUp
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { Tooltip } from '../../components/ui/Tooltip'
import { useAppStore, useAuthStore } from '../../stores'

interface Exam {
    id: number
    name: string
}

interface Allocation {
    id: number
    subject_id: number
    stream_id: number
    subject_name: string
    stream_name: string
    curriculum: string
}

interface StudentResult {
    student_id: number
    student_name: string
    admission_number: string
    score: number | null
    competency_level: number | null
    teacher_remarks: string
}

export default function MarksEntry() {
    const { currentAcademicYear, currentTerm } = useAppStore()
    const { user } = useAuthStore()

    const [exams, setExams] = useState<Exam[]>([])
    const [allocations, setAllocations] = useState<Allocation[]>([])
    const [results, setResults] = useState<StudentResult[]>([])

    const [selectedExam, setSelectedExam] = useState<number>(0)
    const [selectedAllocation, setSelectedAllocation] = useState<number>(0)

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [processing, setProcessing] = useState(false)

    useEffect(() => {
        if (currentAcademicYear && currentTerm) {
            loadInitialData()
        }
    }, [currentAcademicYear, currentTerm])

    useEffect(() => {
        if (selectedExam && selectedAllocation) {
            loadResults()
        }
    }, [selectedExam, selectedAllocation])

    const loadInitialData = async () => {
        if (!currentAcademicYear || !currentTerm || !user) return
        try {
            const [examsData, allocationsData] = await Promise.all([
                window.electronAPI.getAcademicExams(currentAcademicYear.id, currentTerm.id),
                window.electronAPI.getTeacherAllocations(currentAcademicYear.id, currentTerm.id) // Filtered by teacher in backend would be better
            ])

            // In a real app, we would filter allocations by the logged-in teacher's staff ID.
            // Since we are in a demo, let's show all or the user's allocated ones.
            setExams(examsData)
            setAllocations(allocationsData)
        } catch (error) {
            console.error('Failed to load marks entry data:', error)
        }
    }

    const loadResults = async () => {
        const alloc = allocations.find((a: Allocation) => a.id === selectedAllocation)
        if (!selectedExam || !alloc) return

        setLoading(true)
        try {
            const data = await window.electronAPI.getAcademicResults(
                selectedExam, alloc.subject_id, alloc.stream_id, user!.id
            )
            setResults(data)
        } catch (error) {
            console.error('Failed to load results:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleScoreChange = (studentId: number, field: keyof StudentResult, value: any) => {
        setResults(prev => prev.map(r =>
            r.student_id === studentId ? { ...r, [field]: value } : r
        ))
    }

    const handleSave = async () => {
        if (!selectedExam || !user) return

        setSaving(true)
        try {
            await window.electronAPI.saveAcademicResults(selectedExam, results, user.id)
            alert('Results saved successfully!')
        } catch (error) {
            console.error('Failed to save results:', error)
            alert('Failed to save results')
        } finally {
            setSaving(false)
        }
    }

    const handleProcessResults = async () => {
        if (!selectedExam || !user) return
        if (!confirm('This will calculate ranks and averages for the entire school for this exam. Proceed?')) return

        setProcessing(true)
        try {
            await window.electronAPI.processAcademicResults(selectedExam, user.id)
            alert('Results processed successfully! Ranks have been updated.')
        } catch (error) {
            console.error('Failed to process results:', error)
            alert('Failed to process results')
        } finally {
            setProcessing(false)
        }
    }

    const selectedAlloc = allocations.find((a: Allocation) => a.id === selectedAllocation)
    const isCBC = selectedAlloc?.curriculum === 'CBC' || selectedAlloc?.curriculum === 'ECDE'

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Marks Entry"
                subtitle="Enter and manage student performance records"
                breadcrumbs={[{ label: 'Academics' }, { label: 'Marks Entry' }]}
                actions={
                    <div className="flex gap-3">
                        <Tooltip content="Calculate and update global rankings, averages, and mean grades for all students in this exam.">
                            <button
                                onClick={handleProcessResults}
                                disabled={processing || !selectedExam}
                                className="btn bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
                            >
                                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                                Process Ranks
                            </button>
                        </Tooltip>
                        <button
                            onClick={handleSave}
                            disabled={saving || results.length === 0}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Results
                        </button>
                    </div>
                }
            />

            {/* Filters */}
            <div className="premium-card">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Select
                        label="Exam"
                        value={selectedExam}
                        onChange={(val) => setSelectedExam(Number(val))}
                        options={[
                            { value: 0, label: 'Select exam...' },
                            ...exams.map((e: Exam) => ({ value: e.id, label: e.name }))
                        ]}
                    />

                    <Select
                        label="Allocated Subject / Class"
                        value={selectedAllocation}
                        onChange={(val) => setSelectedAllocation(Number(val))}
                        options={[
                            { value: 0, label: 'Select subject & class...' },
                            ...allocations.map((a: Allocation) => ({
                                value: a.id,
                                label: `${a.subject_name} — ${a.stream_name} (${a.curriculum})`
                            }))
                        ]}
                        className="lg:col-span-2"
                    />
                </div>
            </div>

            {/* Results Grid */}
            <div className="premium-card min-h-[400px]">
                {!selectedExam || !selectedAllocation ? (
                    <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                        <Search className="w-12 h-12 opacity-20" />
                        <p>Select an exam and your allocated subject to begin</p>
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center h-64 text-foreground/40">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                ) : results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3 font-semibold">
                        <AlertCircle className="w-12 h-12 text-amber-500 opacity-50" />
                        <p>No students found for the selected class.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="pb-4 pt-2 font-bold text-foreground/60 w-1/4">Student</th>
                                    <th className="pb-4 pt-2 font-bold text-foreground/60 w-1/4">
                                        {isCBC ? 'Competency Level' : 'Score (0-100)'}
                                    </th>
                                    <th className="pb-4 pt-2 font-bold text-foreground/60">Teacher Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {results.map((row: StudentResult) => (
                                    <tr key={row.student_id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="py-4 pr-4">
                                            <p className="font-bold text-white">{row.student_name}</p>
                                            <p className="text-xs text-foreground/40 font-mono tracking-tighter uppercase">{row.admission_number}</p>
                                        </td>
                                        <td className="py-4 pr-4">
                                            {isCBC ? (
                                                <Select
                                                    value={row.competency_level || 0}
                                                    onChange={(val) => handleScoreChange(row.student_id, 'competency_level', Number(val))}
                                                    options={[
                                                        { value: 0, label: 'Select Level...' },
                                                        { value: 4, label: '4 - Exceeding Expectations' },
                                                        { value: 3, label: '3 - Meeting Expectations' },
                                                        { value: 2, label: '2 - Approaching Expectations' },
                                                        { value: 1, label: '1 - Below Expectations' }
                                                    ]}
                                                    className="w-full"
                                                />
                                            ) : (
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={row.score === null ? '' : row.score}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(row.student_id, 'score', e.target.value === '' ? null : Number(e.target.value))}
                                                        className="w-full bg-sidebar border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-center"
                                                        placeholder="0-100"
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-4">
                                            <input
                                                type="text"
                                                value={row.teacher_remarks || ''}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(row.student_id, 'teacher_remarks', e.target.value)}
                                                className="w-full bg-sidebar border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                                                placeholder="e.g. Excellent work, keep it up"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
