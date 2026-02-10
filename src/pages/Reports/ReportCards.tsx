import {
    FileText, Users, Download, Loader2, Eye
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { InstitutionalHeader } from '../../components/patterns/InstitutionalHeader'
import { PageHeader } from '../../components/patterns/PageHeader'
import { StatCard } from '../../components/patterns/StatCard'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'

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
    const [nextTermDate, setNextTermDate] = useState<string>('')

    useEffect(() => {
        void loadStreams()
    }, [])



    const loadStreams = async () => {
        try {
            const data = await window.electronAPI.getStreams()
            setStreams(data)
        } catch (error) {
            console.error('Failed to load streams:', error)
        }
    }

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear || !currentTerm) {return}
        setLoading(true)
        try {
            const data = await window.electronAPI.getStudentsForReportCards(
                selectedStream, currentAcademicYear.id, currentTerm.id
            )
            setStudents(data)
        } catch (error) {
            console.error('Failed to load students:', error)
        } finally {
            setLoading(false)
        }
    }, [selectedStream, currentAcademicYear, currentTerm])

    useEffect(() => {
        if (selectedStream && currentAcademicYear && currentTerm) {
            void loadStudents()
        }
    }, [selectedStream, currentAcademicYear, currentTerm, loadStudents])

    const handlePreview = async (studentId: number) => {
        if (!currentAcademicYear || !currentTerm) {return}
        setGenerating(true)
        try {
            const data = await window.electronAPI.generateReportCard(
                studentId, currentAcademicYear.id, currentTerm.id
            )
            if (data) {
                setPreviewData(data)
                setShowPreview(true)
            } else {
                alert('No report card data available for this student')
            }
        } catch (error) {
            console.error('Failed to generate report card:', error)
        } finally {
            setGenerating(false)
        }
    }

    const handleDownloadPDF = async () => {
        if (!previewData) {return}

        const { default: jsPDF } = await import('jspdf')
        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        let y = 20

        // Header
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.text('MWINGI ADVENTIST SCHOOL', pageWidth / 2, y, { align: 'center' })
        y += 8
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text('P.O. Box 123, Mwingi, Kenya | Tel: +254 700 000 000', pageWidth / 2, y, { align: 'center' })
        y += 6
        doc.text('Email: info@mwingiadventist.ac.ke | Website: www.mwingiadventist.ac.ke', pageWidth / 2, y, { align: 'center' })
        y += 12

        // Report Card Title
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('STUDENT REPORT CARD', pageWidth / 2, y, { align: 'center' })
        y += 10

        // Student Info
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text(`Name: ${previewData.student.first_name} ${previewData.student.last_name}`, 15, y)
        doc.text(`Adm No: ${previewData.student.admission_number}`, 120, y)
        y += 6
        doc.text(`Class: ${previewData.student.stream_name}`, 15, y)
        doc.text(`Term: ${previewData.term}`, 120, y)
        y += 6
        doc.text(`Academic Year: ${previewData.academic_year}`, 15, y)
        y += 10

        // Grades Table
        if (previewData.grades.length > 0) {
            doc.setFont('helvetica', 'bold')
            doc.text('SUBJECT PERFORMANCE', 15, y)
            y += 6

            // Table Headers
            doc.setFillColor(45, 55, 72)
            doc.rect(15, y, pageWidth - 30, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(8)
            const headers = ['Subject', 'CAT1', 'CAT2', 'Mid', 'Final', 'Avg', 'Grade', 'Remarks']
            const colWidths = [40, 15, 15, 15, 15, 15, 15, 50]
            let x = 17
            headers.forEach((h, i) => {
                doc.text(h, x, y + 5.5)
                x += colWidths[i]
            })
            y += 10
            doc.setTextColor(0, 0, 0)

            // Table Rows
            doc.setFont('helvetica', 'normal')
            previewData.grades.forEach((grade, idx) => {
                if (idx % 2 === 0) {
                    doc.setFillColor(248, 250, 252)
                    doc.rect(15, y - 1, pageWidth - 30, 7, 'F')
                }
                x = 17
                const row = [
                    grade.subject_name.substring(0, 15),
                    grade.cat1?.toString() || '-',
                    grade.cat2?.toString() || '-',
                    grade.midterm?.toString() || '-',
                    grade.final_exam?.toString() || '-',
                    grade.average.toString(),
                    grade.grade_letter,
                    grade.remarks
                ]
                row.forEach((cell, i) => {
                    doc.text(cell, x, y + 3)
                    x += colWidths[i]
                })
                y += 7
            })
        }

        y += 10

        // Summary
        doc.setFont('helvetica', 'bold')
        doc.text('SUMMARY', 15, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.text(`Total Marks: ${previewData.summary.total_marks}`, 15, y)
        doc.text(`Average: ${previewData.summary.average}%`, 70, y)
        doc.text(`Grade: ${previewData.summary.grade}`, 120, y)
        y += 10

        // Attendance
        doc.setFont('helvetica', 'bold')
        doc.text('ATTENDANCE', 15, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.text(`Days Present: ${previewData.attendance.present}/${previewData.attendance.total_days}`, 15, y)
        doc.text(`Attendance Rate: ${previewData.attendance.attendance_rate}%`, 80, y)
        y += 10

        // Remarks
        doc.setFont('helvetica', 'normal')
        doc.text(previewData.summary.teacher_remarks, 15, y, { maxWidth: pageWidth - 30 })
        y += 15

        // Grading Legend
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text('GRADING LEGEND', 15, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text('A: 80 - 100 (Excellent)  |  B: 70 - 79 (Very Good)  |  C: 60 - 69 (Good)  |  D: 50 - 59 (Fair)  |  E: 0 - 49 (Improve)', 15, y)
        y += 15

        // Signatures
        const sigY = y + 20
        doc.setDrawColor(200, 200, 200)
        doc.line(15, sigY, 70, sigY)
        doc.line(pageWidth - 70, sigY, pageWidth - 15, sigY)

        doc.setFont('helvetica', 'bold')
        doc.text('Class Teacher Signature', 15, sigY + 5)
        doc.text('Principal Signature', pageWidth - 70, sigY + 5)

        // Next Term Date
        if (nextTermDate) {
            y = sigY + 15
            doc.setFont('helvetica', 'bold')
            doc.text(`NEXT TERM BEGINS ON: ${new Date(nextTermDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}`, pageWidth / 2, y, { align: 'center' })
        }

        doc.save(`report-card-${previewData.student.admission_number}.pdf`)
    }

    return (
        <div className="space-y-8 pb-10">
            <InstitutionalHeader />
            <PageHeader
                title="Report Cards"
                subtitle="Generate and print student report cards"
                breadcrumbs={[{ label: 'Students' }, { label: 'Report Cards' }]}
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
                            className="input w-full bg-secondary/10 border-border/20"
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
                                        onClick={() => handlePreview(student.student_id)}
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

            {/* Preview Modal */}
            <Modal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                title="Report Card Preview"
            >
                {previewData && (
                    <div className="space-y-6">
                        <div className="text-center pb-4 border-b border-border/20">
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
                                        {previewData.grades.map((g, i) => (
                                            <tr key={i} className="border-t border-border/20">
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

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="p-3 bg-secondary/30 rounded-lg">
                                <p className="text-foreground/50 text-xs">Average</p>
                                <p className="text-xl font-bold text-foreground">{previewData.summary.average}%</p>
                            </div>
                            <div className="p-3 bg-secondary/30 rounded-lg">
                                <p className="text-foreground/50 text-xs">Attendance</p>
                                <p className="text-xl font-bold text-foreground">{previewData.attendance.attendance_rate}%</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowPreview(false)} className="btn btn-secondary">Close</button>
                            <button onClick={handleDownloadPDF} className="btn btn-primary flex items-center gap-2">
                                <Download className="w-4 h-4" />
                                Download PDF
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
