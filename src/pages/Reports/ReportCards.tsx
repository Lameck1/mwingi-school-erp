import {
    FileText, Users, Loader2, Eye, Printer
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'
import { generateReportCardHTML } from '../../utils/reportCardGenerator'

import type { Stream } from '../../types/electron-api/AcademicAPI'
import type { ReportCardData, ReportCardStudentEntry } from '../../types/electron-api/ReportsAPI'


export default function ReportCards() {
    const { currentAcademicYear, currentTerm } = useAppStore()

    const [streams, setStreams] = useState<Stream[]>([])
    const [selectedStream, setSelectedStream] = useState<number>(0)
    const [students, setStudents] = useState<ReportCardStudentEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState(false)

    const [showPreview, setShowPreview] = useState(false)
    const [previewData, setPreviewData] = useState<ReportCardData | null>(null)
    // Reserved for future PDF preview URL state
    const [nextTermDate, setNextTermDate] = useState<string>('')

    useEffect(() => {
        void loadStreams()
    }, [])

    const loadStreams = async () => {
        try {
            const data = await globalThis.electronAPI.getStreams()
            if (Array.isArray(data)) {
                setStreams(data)
            }
        } catch (error) {
            console.error('Failed to load streams:', error)
        }
    }

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear || !currentTerm) { return }
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getStudentsForReportCards(
                selectedStream, currentAcademicYear.id, currentTerm.id
            )
            if (Array.isArray(data)) {
                setStudents(data)
            }
        } catch (error) {
            console.error('Failed to load students:', error)
        } finally {
            setLoading(false)
        }
    }, [selectedStream, currentAcademicYear, currentTerm])

    useEffect(() => {
        if (selectedStream && currentAcademicYear && currentTerm) {
            loadStudents().catch((err: unknown) => console.error('Failed to load students for report cards', err))
        }
    }, [selectedStream, currentAcademicYear, currentTerm, loadStudents])


    const handleViewStudent = async (studentId: number) => {
        if (!currentAcademicYear || !currentTerm) { return }
        setGenerating(true)
        try {
            const result = await globalThis.electronAPI.generateReportCard(
                studentId, currentAcademicYear.id, currentTerm.id
            )
            if (result && !('success' in result)) {
                setPreviewData(result)
                setShowPreview(true)
            } else if (result && 'success' in result && result.success === false) {
                alert(result.error)
            } else {
                alert('No report card data available for this student')
            }
        } catch (error) {
            console.error('Failed to generate report card:', error)
        } finally {
            setGenerating(false)
        }
    }

    const handlePrintPreview = async () => {
        if (!previewData) { return }
        try {
            const htmlContent = generateReportCardHTML(previewData, nextTermDate)
            const { previewHTML } = await import('../../utils/print')

            const onDownload = () => {
                globalThis.electronAPI.reports.downloadReportCardPDF(
                    htmlContent,
                    `report-card-${previewData.student.admission_number}.pdf`
                ).catch((err: unknown) => {
                    console.error('Failed to download PDF:', err)
                    alert('Failed to download PDF')
                })
            }

            previewHTML(`Report Card - ${previewData.student.admission_number}`, htmlContent, onDownload)
        } catch (error) {
            console.error('Failed to preview report card:', error)
            alert('Failed to preview report card')
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Report Cards"
                subtitle="Generate and print student report cards"
                breadcrumbs={[{ label: 'Academics', href: '/academics' }, { label: 'Report Cards' }, { label: 'View Report Cards' }]}
            />

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Students"
                    value={students.length.toString()}
                    icon={Users}
                    color="from-blue-500/20 to-indigo-500/20 text-blue-400"
                />
                <StatCard
                    label="Current Term"
                    value={currentTerm?.term_name || 'N/A'}
                    icon={FileText}
                    color="from-emerald-500/20 to-teal-500/20 text-emerald-400"
                />
                <StatCard
                    label="Academic Year"
                    value={currentAcademicYear?.year_name || 'N/A'}
                    icon={FileText}
                    color="from-purple-500/20 to-pink-500/20 text-purple-400"
                />
            </div>

            {/* Filters */}
            <div className="premium-card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                        label="Class"
                        value={selectedStream}
                        onChange={(val) => setSelectedStream(Number(val))}
                        options={[
                            { value: 0, label: 'Select class...' },
                            ...streams.map(s => ({ value: s.id, label: s.stream_name }))
                        ]}
                    />
                    <div className="space-y-1">
                        <label htmlFor="next-term-date" className="text-xs font-bold text-foreground/50 uppercase tracking-widest ml-1">Next Term Begins</label>
                        <input
                            id="next-term-date"
                            type="date"
                            value={nextTermDate}
                            onChange={(e) => setNextTermDate(e.target.value)}
                            className="input w-full border-border/20"
                        />
                    </div>
                </div>
            </div>

            {/* Students List */}
            <div className="premium-card">
                <h3 className="text-lg font-bold text-foreground mb-4">Students</h3>
                {(() => {
                    if (loading) {
                        return <div className="text-center py-16 text-foreground/40">Loading students...</div>
                    }

                    if (students.length === 0) {
                        return (
                            <div className="text-center py-16 text-foreground/40">
                                {selectedStream ? 'No students found' : 'Select a class to view students'}
                            </div>
                        )
                    }

                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {students.map(student => (
                                <div key={student.student_id} className="flex items-center justify-between p-4 bg-secondary/20 rounded-xl border border-border/30">
                                    <div>
                                        <p className="font-bold text-foreground">{student.student_name}</p>
                                        <p className="text-xs text-foreground/50 font-mono">{student.admission_number}</p>
                                    </div>
                                    <button
                                        onClick={() => handleViewStudent(student.student_id)}
                                        disabled={generating}
                                        className="btn btn-secondary text-sm flex items-center gap-1"
                                    >
                                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                        View
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                })()}
            </div>

            {/* View Student Modal (HTML Summary) */}
            <Modal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                title="Student Report Card Summary"
            >
                {previewData && (
                    <div className="space-y-6">
                        <div className="text-center pb-4 border-b border-border/20">
                            {previewData.student.photo && (
                                <img
                                    src={previewData.student.photo}
                                    alt="Student"
                                    className="w-24 h-24 rounded-full mx-auto mb-3 object-cover border border-border/30"
                                />
                            )}
                            <h2 className="text-xl font-bold text-foreground">{previewData.student.first_name} {previewData.student.last_name}</h2>
                            <p className="text-sm text-foreground/50">{previewData.student.admission_number} • {previewData.student.stream_name}</p>
                            <p className="text-xs text-foreground/40">{previewData.term} - {previewData.academic_year}</p>
                        </div>

                        {previewData.grades.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-foreground/50 text-xs uppercase">
                                            <th className="pb-2">Subject</th>
                                            <th className="pb-2 text-center">Avg</th>
                                            <th className="pb-2 text-center">Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.grades.map((g) => (
                                            <tr key={`${g.subject_name}-${g.grade_letter}`} className="border-t border-border/20">
                                                <td className="py-2 text-foreground font-medium">{g.subject_name}</td>
                                                <td className="py-2 text-center font-mono">{g.average}%</td>
                                                <td className="py-2 text-center font-bold text-primary">{g.grade_letter}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-foreground/40 py-4">No grades recorded yet</p>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-sm border-t border-border/20 pt-4">
                            <div className="p-3 bg-secondary/30 rounded-lg">
                                <p className="text-foreground/50 text-xs uppercase font-bold">Performance</p>
                                <div className="flex justify-between items-end mt-1">
                                    <div>
                                        <span className="text-2xl font-bold text-foreground">{previewData.summary.average}%</span>
                                        <span className="text-sm text-foreground/50 ml-1">Mean</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold text-primary">{previewData.summary.grade}</span>
                                        <span className="text-sm text-foreground/50 ml-1">Grade</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3 bg-secondary/30 rounded-lg">
                                <p className="text-foreground/50 text-xs uppercase font-bold">Attendance</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{previewData.attendance.attendance_rate}%</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                            <button onClick={() => setShowPreview(false)} className="btn btn-secondary">Close</button>
                            <button onClick={handlePrintPreview} className="btn btn-primary flex items-center gap-2">
                                <Printer className="w-4 h-4" />
                                Preview / Print PDF
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
