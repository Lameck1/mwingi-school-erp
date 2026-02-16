import {
    ArrowUpRight, Users, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { buildPromotionRunFeedback, type PromotionRunFeedback } from './promotion-feedback.logic'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../contexts/ToastContext'
import { useAppStore, useAuthStore } from '../../stores'
import { type Stream, type AcademicYear, type Term, type PromotionStudent } from '../../types/electron-api/AcademicAPI'
import { reportRuntimeError } from '../../utils/runtimeError'

export default function Promotions() {
    const { currentAcademicYear } = useAppStore()
    const { user } = useAuthStore()
    const { showToast } = useToast()

    const [streams, setStreams] = useState<Stream[]>([])
    const [students, setStudents] = useState<PromotionStudent[]>([])
    const [selectedStudents, setSelectedStudents] = useState<number[]>([])
    const [loading, setLoading] = useState(false)
    const [promoting, setPromoting] = useState(false)

    const [fromStream, setFromStream] = useState<number>(0)
    const [toStream, setToStream] = useState<number>(0)
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [toAcademicYear, setToAcademicYear] = useState<number>(0)
    const [toTerm, setToTerm] = useState<number>(0)
    const [terms, setTerms] = useState<Term[]>([])
    const [lastPromotionFeedback, setLastPromotionFeedback] = useState<PromotionRunFeedback | null>(null)
    const [confirmingPromotion, setConfirmingPromotion] = useState(false)

    const loadStreams = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getPromotionStreams()
            setStreams(data)
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadStreams' }, 'Failed to load streams')
        }
    }, [])

    const loadAcademicYears = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getAcademicYears()
            setAcademicYears(data)
            // Default to next academic year if available
            if (data.length > 1) {
                setToAcademicYear(data[0].id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadAcademicYears' }, 'Failed to load academic years')
        }
    }, [])

    const loadTerms = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getTermsByYear(toAcademicYear)
            setTerms(data)
            if (data.length > 0) {
                setToTerm(data[0].id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadTerms' }, 'Failed to load terms')
        }
    }, [toAcademicYear])

    useEffect(() => {
        loadStreams().catch((err: unknown) => console.error('Failed to load streams', err))
        loadAcademicYears().catch((err: unknown) => console.error('Failed to load academic years', err))
    }, [loadStreams, loadAcademicYears])

    useEffect(() => {
        if (toAcademicYear) {
            loadTerms().catch((err: unknown) => console.error('Failed to load terms', err))
        }
    }, [toAcademicYear, loadTerms])

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear) {return}
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getStudentsForPromotion(fromStream, currentAcademicYear.id)
            setStudents(data)
            setSelectedStudents([])
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadStudents' }, 'Failed to load students')
        } finally {
            setLoading(false)
        }
    }, [fromStream, currentAcademicYear])

    const suggestNextStream = useCallback(async () => {
        try {
            const next = await globalThis.electronAPI.getNextStream(fromStream)
            if (next) {
                setToStream(next.id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'suggestNextStream' }, 'Failed to get next stream')
        }
    }, [fromStream])

    useEffect(() => {
        if (fromStream && currentAcademicYear) {
            loadStudents().catch((err: unknown) => {
                reportRuntimeError(err, { area: 'Students.Promotions', action: 'loadStudentsEffect' }, 'Failed to load students for promotion')
            })
            suggestNextStream().catch((err: unknown) => {
                reportRuntimeError(err, { area: 'Students.Promotions', action: 'suggestNextStreamEffect' }, 'Failed to suggest next stream')
            })
        }
    }, [fromStream, currentAcademicYear, loadStudents, suggestNextStream])

    const toggleStudent = (studentId: number) => {
        setSelectedStudents(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        )
    }

    const selectAll = () => {
        if (selectedStudents.length === students.length) {
            setSelectedStudents([])
        } else {
            setSelectedStudents(students.map(s => s.student_id))
        }
    }

    const handlePromote = () => {
        if (!currentAcademicYear || !user) {return}
        if (selectedStudents.length === 0) {
            showToast('Please select students to promote', 'warning')
            return
        }
        if (!toStream || !toAcademicYear || !toTerm) {
            showToast('Please select destination stream, academic year, and term', 'warning')
            return
        }

        setConfirmingPromotion(true)
    }

    const executePromotion = async () => {
        if (!currentAcademicYear || !user) {return}

        setConfirmingPromotion(false)
        setLastPromotionFeedback(null)
        setPromoting(true)
        try {
            const result = await globalThis.electronAPI.batchPromoteStudents(
                selectedStudents,
                fromStream,
                toStream,
                currentAcademicYear.id,
                toAcademicYear,
                toTerm,
                user.id
            )

            setLastPromotionFeedback(buildPromotionRunFeedback(result, selectedStudents, students))

            if (result.success) {
                showToast(`Successfully promoted ${result.promoted} students`, 'success')
                await loadStudents()
            } else {
                showToast(`Promotion completed with ${result.failed} failure(s)`, 'warning')
                if (result.promoted > 0) {
                    await loadStudents()
                }
            }
        } catch (error) {
            const errorMessage = reportRuntimeError(error, { area: 'Students.Promotions', action: 'executePromotion' }, 'Failed to promote students')
            setLastPromotionFeedback({
                attempted: selectedStudents.length,
                promoted: 0,
                failed: selectedStudents.length,
                errors: [errorMessage],
                failureDetails: []
            })
            showToast(errorMessage, 'error')
        } finally {
            setPromoting(false)
        }
    }

    const renderPromotionFeedback = () => {
        if (!lastPromotionFeedback) {return null}

        const hasFailures = lastPromotionFeedback.failed > 0
        const borderTone = hasFailures ? 'border-amber-500/30' : 'border-emerald-500/30'
        const badgeTone = hasFailures
            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'

        return (
            <div className={`premium-card border ${borderTone}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-foreground">Last Promotion Run</h3>
                    <span className={`text-xs px-3 py-1 rounded-full border ${badgeTone}`}>
                        Promoted {lastPromotionFeedback.promoted} / Failed {lastPromotionFeedback.failed}
                    </span>
                </div>

                <p className="text-sm text-foreground/70 mt-2">
                    Attempted {lastPromotionFeedback.attempted} student{lastPromotionFeedback.attempted === 1 ? '' : 's'}.
                </p>

                {lastPromotionFeedback.errors.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {lastPromotionFeedback.errors.map(error => (
                            <p key={error} className="text-sm text-amber-200">
                                {error}
                            </p>
                        ))}
                    </div>
                )}

                {lastPromotionFeedback.failureDetails.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {lastPromotionFeedback.failureDetails.map(detail => (
                            <div key={`${detail.student_id}-${detail.reason}`} className="rounded-xl border border-border/40 bg-secondary/20 p-3">
                                <p className="text-sm font-semibold text-foreground">{detail.student_name}</p>
                                <p className="text-xs text-foreground/50 font-mono">{detail.admission_number}</p>
                                <p className="text-sm text-foreground/70 mt-2">{detail.reason}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    const renderStudents = () => {
        if (loading) {
            return <div className="text-center py-16 text-foreground/40">Loading students...</div>
        }

        if (students.length === 0) {
            return (
                <div className="text-center py-16 text-foreground/40">
                    {fromStream ? 'No students found in this class' : 'Select a class to view students'}
                </div>
            )
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {students.map(student => (
                    <button
                        key={student.student_id}
                        type="button"
                        onClick={() => toggleStudent(student.student_id)}
                        aria-label={`Toggle student ${student.student_name}`}
                        className={`w-full text-left p-4 rounded-xl border cursor-pointer transition-all duration-300 ${selectedStudents.includes(student.student_id)
                            ? 'bg-primary/10 border-primary/40'
                            : 'bg-secondary/30 border-border/20 hover:border-primary/30 hover:bg-secondary/50'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors duration-300 ${selectedStudents.includes(student.student_id)
                                ? 'bg-primary border-primary'
                                : 'border-border/60 bg-background'
                                }`}>
                                {selectedStudents.includes(student.student_id) && (
                                    <CheckCircle className="w-3 h-3 text-primary-foreground" />
                                )}
                            </div>
                            <div>
                                <p className="font-bold text-foreground">{student.student_name}</p>
                                <p className="text-xs text-foreground/40 font-mono">{student.admission_number}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Student Promotions"
                subtitle="Promote students to the next class"
                breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Promotions' }]}
            />

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Students in Class"
                    value={students.length.toString()}
                    icon={Users}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-500"
                />
                <StatCard
                    label="Selected"
                    value={selectedStudents.length.toString()}
                    icon={CheckCircle}
                    color="from-emerald-500/20 to-teal-500/20 text-emerald-500"
                />
                <StatCard
                    label="Pending"
                    value={(students.length - selectedStudents.length).toString()}
                    icon={AlertCircle}
                    color="from-amber-500/20 to-orange-500/20 text-amber-500"
                />
            </div>

            {/* Filters */}
            <div className="premium-card">
                <h3 className="text-lg font-bold text-foreground mb-4">Promotion Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Select
                        label="From Class"
                        value={fromStream}
                        onChange={(val) => setFromStream(Number(val))}
                        options={[
                            { value: 0, label: 'Select class...' },
                            ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                        ]}
                    />

                    <Select
                        label="To Class"
                        value={toStream}
                        onChange={(val) => setToStream(Number(val))}
                        options={[
                            { value: 0, label: 'Select class...' },
                            ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                        ]}
                    />

                    <Select
                        label="To Academic Year"
                        value={toAcademicYear}
                        onChange={(val) => setToAcademicYear(Number(val))}
                        options={[
                            { value: 0, label: 'Select year...' },
                            ...academicYears.map(y => ({ value: y.id, label: y.year_name }))
                        ]}
                    />

                    <Select
                        label="To Term"
                        value={toTerm}
                        onChange={(val) => setToTerm(Number(val))}
                        options={[
                            { value: 0, label: 'Select term...' },
                            ...terms.map(t => ({ value: t.id, label: t.term_name }))
                        ]}
                    />
                </div>
            </div>

            {renderPromotionFeedback()}

            {/* Students List */}
            <div className="premium-card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-foreground">Students</h3>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={selectAll}
                            className="btn btn-secondary text-sm"
                        >
                            {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                            onClick={handlePromote}
                            disabled={promoting || selectedStudents.length === 0}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {promoting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <ArrowUpRight className="w-4 h-4" />
                            )}
                            Promote Selected ({selectedStudents.length})
                        </button>
                    </div>
                </div>

                {renderStudents()}
            </div>

            <ConfirmDialog
                isOpen={confirmingPromotion}
                title="Confirm Promotion"
                message={`Promote ${selectedStudents.length} selected student${selectedStudents.length === 1 ? '' : 's'} to the selected class and academic term?`}
                confirmLabel="Promote Students"
                onCancel={() => setConfirmingPromotion(false)}
                onConfirm={() => { void executePromotion() }}
                isProcessing={promoting}
            />
        </div>
    )
}

