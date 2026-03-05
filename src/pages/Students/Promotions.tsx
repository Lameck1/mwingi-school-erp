import {
    ArrowUpRight, Users, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'

import type { PromotionRunFeedback } from './promotion-feedback.logic'
import { usePromotions } from './usePromotions'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Select } from '../../components/ui/Select'
import { type Stream, type AcademicYear, type Term, type PromotionStudent } from '../../types/electron-api/AcademicAPI'

// --- Sub-components ---

type PromotionFeedbackPanelProps = Readonly<{
    feedback: PromotionRunFeedback | null
}>

function PromotionFeedbackPanel({ feedback }: PromotionFeedbackPanelProps) {
    if (!feedback) { return null }

    const hasFailures = feedback.failed > 0
    const borderTone = hasFailures ? 'border-amber-500/30' : 'border-emerald-500/30'
    const badgeTone = hasFailures
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'

    return (
        <div className={`premium-card border ${borderTone}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-foreground">Last Promotion Run</h3>
                <span className={`text-xs px-3 py-1 rounded-full border ${badgeTone}`}>
                    Promoted {feedback.promoted} / Failed {feedback.failed}
                </span>
            </div>

            <p className="text-sm text-foreground/70 mt-2">
                Attempted {feedback.attempted} student{feedback.attempted === 1 ? '' : 's'}.
            </p>

            {feedback.errors.length > 0 && (
                <div className="mt-4 space-y-2">
                    {feedback.errors.map(error => (
                        <p key={error} className="text-sm text-amber-200">
                            {error}
                        </p>
                    ))}
                </div>
            )}

            {feedback.failureDetails.length > 0 && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {feedback.failureDetails.map(detail => (
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

type PromotionSettingsPanelProps = Readonly<{
    streams: Stream[]
    academicYears: AcademicYear[]
    terms: Term[]
    fromStream: number
    toStream: number
    toAcademicYear: number
    toTerm: number
    onFromStreamChange: (val: number) => void
    onToStreamChange: (val: number) => void
    onToAcademicYearChange: (val: number) => void
    onToTermChange: (val: number) => void
}>

function PromotionSettingsPanel({
    streams, academicYears, terms, fromStream, toStream, toAcademicYear, toTerm,
    onFromStreamChange, onToStreamChange, onToAcademicYearChange, onToTermChange
}: PromotionSettingsPanelProps) {
    return (
        <div className="premium-card">
            <h3 className="text-lg font-bold text-foreground mb-4">Promotion Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Select
                    label="From Class"
                    value={fromStream}
                    onChange={(val) => onFromStreamChange(Number(val))}
                    options={[
                        { value: 0, label: 'Select class...' },
                        ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                    ]}
                />
                <Select
                    label="To Class"
                    value={toStream}
                    onChange={(val) => onToStreamChange(Number(val))}
                    options={[
                        { value: 0, label: 'Select class...' },
                        ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                    ]}
                />
                <Select
                    label="To Academic Year"
                    value={toAcademicYear}
                    onChange={(val) => onToAcademicYearChange(Number(val))}
                    options={[
                        { value: 0, label: 'Select year...' },
                        ...academicYears.map(y => ({ value: y.id, label: y.year_name }))
                    ]}
                />
                <Select
                    label="To Term"
                    value={toTerm}
                    onChange={(val) => onToTermChange(Number(val))}
                    options={[
                        { value: 0, label: 'Select term...' },
                        ...terms.map(t => ({ value: t.id, label: t.term_name }))
                    ]}
                />
            </div>
        </div>
    )
}

type StudentListSectionProps = Readonly<{
    loading: boolean
    students: PromotionStudent[]
    selectedStudents: number[]
    fromStream: number
    promoting: boolean
    onToggleStudent: (studentId: number) => void
    onSelectAll: () => void
    onPromote: () => void
}>

function StudentListSection({
    loading, students, selectedStudents, fromStream, promoting,
    onToggleStudent, onSelectAll, onPromote
}: StudentListSectionProps) {
    if (loading) {
        return (
            <div className="premium-card">
                <div className="text-center py-16 text-foreground/40">Loading students...</div>
            </div>
        )
    }

    return (
        <div className="premium-card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">Students</h3>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onSelectAll}
                        className="btn btn-secondary text-sm"
                    >
                        {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                        onClick={onPromote}
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

            {students.length === 0 ? (
                <div className="text-center py-16 text-foreground/40">
                    {fromStream ? 'No students found in this class' : 'Select a class to view students'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {students.map(student => (
                        <button
                            key={student.student_id}
                            type="button"
                            onClick={() => onToggleStudent(student.student_id)}
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
            )}
        </div>
    )
}

type PromotionHeaderSectionProps = Readonly<{
    studentCount: number
    selectedCount: number
}>

function PromotionHeaderSection({ studentCount, selectedCount }: PromotionHeaderSectionProps) {
    return (
        <>
            <PageHeader
                title="Student Promotions"
                subtitle="Promote students to the next class"
                breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Promotions' }]}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Students in Class"
                    value={studentCount.toString()}
                    icon={Users}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-500"
                />
                <StatCard
                    label="Selected"
                    value={selectedCount.toString()}
                    icon={CheckCircle}
                    color="from-emerald-500/20 to-teal-500/20 text-emerald-500"
                />
                <StatCard
                    label="Pending"
                    value={(studentCount - selectedCount).toString()}
                    icon={AlertCircle}
                    color="from-amber-500/20 to-orange-500/20 text-amber-500"
                />
            </div>
        </>
    )
}

export default function Promotions() {
    const {
        streams, students, selectedStudents, academicYears, terms,
        lastPromotionFeedback, loading, promoting,
        fromStream, toStream, toAcademicYear, toTerm, confirmingPromotion,
        setFromStream, setToStream, setToAcademicYear, setToTerm,
        toggleStudent, selectAll, handlePromote, executePromotion, cancelPromotion,
    } = usePromotions()

    return (
        <div className="space-y-8 pb-10">
            <PromotionHeaderSection
                studentCount={students.length}
                selectedCount={selectedStudents.length}
            />

            <PromotionSettingsPanel
                streams={streams}
                academicYears={academicYears}
                terms={terms}
                fromStream={fromStream}
                toStream={toStream}
                toAcademicYear={toAcademicYear}
                toTerm={toTerm}
                onFromStreamChange={setFromStream}
                onToStreamChange={setToStream}
                onToAcademicYearChange={setToAcademicYear}
                onToTermChange={setToTerm}
            />

            <PromotionFeedbackPanel feedback={lastPromotionFeedback} />

            <StudentListSection
                loading={loading}
                students={students}
                selectedStudents={selectedStudents}
                fromStream={fromStream}
                promoting={promoting}
                onToggleStudent={toggleStudent}
                onSelectAll={selectAll}
                onPromote={handlePromote}
            />

            <ConfirmDialog
                isOpen={confirmingPromotion}
                title="Confirm Promotion"
                message={`Promote ${selectedStudents.length} selected student${selectedStudents.length === 1 ? '' : 's'} to the selected class and academic term?`}
                confirmLabel="Promote Students"
                onCancel={cancelPromotion}
                onConfirm={() => { void executePromotion() }}
                isProcessing={promoting}
            />
        </div>
    )
}
