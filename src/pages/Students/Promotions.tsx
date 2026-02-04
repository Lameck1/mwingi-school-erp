import { useState, useEffect, useCallback } from 'react'
import {
    ArrowUpRight, Users, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Select } from '../../components/ui/Select'
import { useAppStore, useAuthStore } from '../../stores'

interface Stream {
    id: number
    stream_name: string
    grade_level: number
}

interface Enrollment {
    id: number
    student_id: number
    student_name: string
    admission_number: string
    stream_name: string
}

export default function Promotions() {
    const { currentAcademicYear } = useAppStore()
    const { user } = useAuthStore()

    const [streams, setStreams] = useState<Stream[]>([])
    const [students, setStudents] = useState<Enrollment[]>([])
    const [selectedStudents, setSelectedStudents] = useState<number[]>([])
    const [loading, setLoading] = useState(false)
    const [promoting, setPromoting] = useState(false)

    const [fromStream, setFromStream] = useState<number>(0)
    const [toStream, setToStream] = useState<number>(0)
    const [academicYears, setAcademicYears] = useState<any[]>([])
    const [toAcademicYear, setToAcademicYear] = useState<number>(0)
    const [toTerm, setToTerm] = useState<number>(0)
    const [terms, setTerms] = useState<any[]>([])

    useEffect(() => {
        loadStreams()
        loadAcademicYears()
    }, [])

    useEffect(() => {
        if (fromStream && currentAcademicYear) {
            loadStudents()
            suggestNextStream()
        }
    }, [fromStream, currentAcademicYear])

    useEffect(() => {
        if (toAcademicYear) {
            loadTerms()
        }
    }, [toAcademicYear])

    const loadStreams = async () => {
        try {
            const data = await (window.electronAPI as unknown).getPromotionStreams()
            setStreams(data)
        } catch (error) {
            console.error('Failed to load streams:', error)
        }
    }

    const loadAcademicYears = async () => {
        try {
            const data = await window.electronAPI.getAcademicYears()
            setAcademicYears(data)
            // Default to next academic year if available
            if (data.length > 1) {
                setToAcademicYear(data[0].id)
            }
        } catch (error) {
            console.error('Failed to load academic years:', error)
        }
    }

    const loadTerms = async () => {
        try {
            const data = await window.electronAPI.getTermsByYear(toAcademicYear)
            setTerms(data)
            if (data.length > 0) {
                setToTerm(data[0].id)
            }
        } catch (error) {
            console.error('Failed to load terms:', error)
        }
    }

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear) return
        setLoading(true)
        try {
            const data = await (window.electronAPI as unknown).getStudentsForPromotion(fromStream, currentAcademicYear.id)
            setStudents(data)
            setSelectedStudents([])
        } catch (error) {
            console.error('Failed to load students:', error)
        } finally {
            setLoading(false)
        }
    }, [fromStream, currentAcademicYear])

    const suggestNextStream = async () => {
        try {
            const next = await (window.electronAPI as unknown).getNextStream(fromStream)
            if (next) {
                setToStream(next.id)
            }
        } catch (error) {
            console.error('Failed to get next stream:', error)
        }
    }

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

    const handlePromote = async () => {
        if (!currentAcademicYear || !user) return
        if (selectedStudents.length === 0) {
            alert('Please select students to promote')
            return
        }
        if (!toStream || !toAcademicYear || !toTerm) {
            alert('Please select destination stream, academic year, and term')
            return
        }

        if (!confirm(`Promote ${selectedStudents.length} students to the selected class?`)) return

        setPromoting(true)
        try {
            const result = await (window.electronAPI as unknown).batchPromoteStudents(
                selectedStudents,
                fromStream,
                toStream,
                currentAcademicYear.id,
                toAcademicYear,
                toTerm,
                user.id
            )

            if (result.success) {
                alert(`Successfully promoted ${result.promoted} students!`)
                loadStudents()
            } else {
                alert(`Promoted ${result.promoted}, Failed: ${result.failed}`)
            }
        } catch (error) {
            console.error('Failed to promote:', error)
            alert('Failed to promote students')
        } finally {
            setPromoting(false)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Student Promotions"
                subtitle="Promote students to the next class"
                breadcrumbs={[{ label: 'Students' }, { label: 'Promotions' }]}
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

                {loading ? (
                    <div className="text-center py-16 text-foreground/40">Loading students...</div>
                ) : students.length === 0 ? (
                    <div className="text-center py-16 text-foreground/40">
                        {fromStream ? 'No students found in this class' : 'Select a class to view students'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {students.map(student => (
                            <div
                                key={student.student_id}
                                onClick={() => toggleStudent(student.student_id)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${selectedStudents.includes(student.student_id)
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
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

