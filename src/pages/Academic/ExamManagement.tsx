import {
    ClipboardList, Plus, Trash2, Save, Loader2, Calendar, LayoutGrid
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { useAppStore, useAuthStore } from '../../stores'

interface Exam {
    id: number
    name: string
    weight?: number
    is_published?: boolean
    created_at?: string
}

export default function ExamManagement() {
    const { currentAcademicYear, currentTerm } = useAppStore()
    const { user } = useAuthStore()

    const [exams, setExams] = useState<Exam[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [newExamName, setNewExamName] = useState('')
    const [newExamWeight, setNewExamWeight] = useState(1)

    const loadExams = useCallback(async () => {
        if (!currentAcademicYear || !currentTerm) {return}
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getAcademicExams(currentAcademicYear.id, currentTerm.id)
            setExams(data)
        } catch (error) {
            console.error('Failed to load exams:', error)
        } finally {
            setLoading(false)
        }
    }, [currentAcademicYear, currentTerm])

    useEffect(() => {
        loadExams().catch((err: unknown) => console.error('Failed to load exams:', err))
    }, [loadExams])

    const handleCreate = async () => {
        if (!currentAcademicYear || !currentTerm || !user || !newExamName) {return}

        setSaving(true)
        try {
            await globalThis.electronAPI.createAcademicExam({
                academic_year_id: currentAcademicYear.id,
                term_id: currentTerm.id,
                name: newExamName,
                weight: Number(newExamWeight)
            }, user.id)

            setNewExamName('')
            setNewExamWeight(1)
            await loadExams()
        } catch (error) {
            console.error('Failed to create exam:', error)
            alert('Failed to create exam')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!user || !confirm('Are you sure you want to delete this exam? All results for this exam will be removed.')) {return}

        try {
            await globalThis.electronAPI.deleteAcademicExam(id, user.id)
            await loadExams()
        } catch (error) {
            console.error('Failed to delete exam:', error)
            alert('Failed to delete exam')
        }
    }

    const renderExamList = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )
        }

        if (exams.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-foreground/40 space-y-3">
                    <Calendar className="w-12 h-12 opacity-20" />
                    <p>No exams created for this term yet</p>
                </div>
            )
        }

        return (
            <div className="space-y-4">
                {exams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between p-4 bg-secondary/20 rounded-xl border border-border/20 hover:border-primary/30 transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <LayoutGrid className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-bold text-foreground">{exam.name}</p>
                                <p className="text-xs text-foreground/40">Weight: {exam.weight} • Created: {exam.created_at ? new Date(exam.created_at).toLocaleDateString() : 'N/A'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleDelete(exam.id)}
                                className="p-2 text-foreground/30 hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Exam Management"
                subtitle="Create and manage examination instances for the current term"
                breadcrumbs={[{ label: 'Academics' }, { label: 'Exams' }]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Create Exam Form */}
                <div className="lg:col-span-1">
                    <div className="premium-card space-y-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Create New Exam
                        </h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="field-99" className="text-sm font-bold text-foreground/60">Exam Name</label>
                                <input id="field-99"
                                    type="text"
                                    value={newExamName}
                                    onChange={(e) => setNewExamName(e.target.value)}
                                    placeholder="e.g. Mid-Term Assessment"
                                    className="input bg-secondary/30 border-border/20 py-2.5 focus:border-primary/50 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="field-110" className="text-sm font-bold text-foreground/60">weight (e.g. 0.3 for 30%)</label>
                                <input id="field-110"
                                    type="number"
                                    step="0.1"
                                    value={newExamWeight}
                                    onChange={(e) => setNewExamWeight(Number(e.target.value))}
                                    className="input bg-secondary/30 border-border/20 py-2.5 focus:border-primary/50 transition-all font-mono"
                                />
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={saving || !newExamName}
                                className="w-full btn btn-primary flex items-center justify-center gap-2 py-3"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Create Exam
                            </button>
                        </div>
                    </div>
                </div>

                {/* Exams List */}
                <div className="lg:col-span-2">
                    <div className="premium-card">
                        <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-primary" />
                            Registered Exams
                        </h3>

                        {renderExamList()}
                    </div>
                </div>
            </div>
        </div>
    )
}
