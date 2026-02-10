
import { Download, AlertTriangle } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'
import { exportToPDF } from '../../utils/exporters'

interface PerformanceSummary {
  mean_score: number
  median_score: number
  mode_score: number
  top_performer: string
  top_performer_score: number
  total_students: number
  pass_count: number
  pass_rate: number
  fail_count: number
  fail_rate: number
}

interface GradeDistribution {
  grade: string
  count: number
  percentage: number
}

interface SubjectPerformance {
  subject_name: string
  mean_score: number
  pass_rate: number
  difficulty_index: number
  discrimination_index: number
}

interface StrugglingStu {
  student_id: number
  student_name: string
  admission_number: string
  average_score: number
  needs_intervention: boolean
  recommended_action: string
}

const ExamAnalytics = () => {
  const { currentAcademicYear, currentTerm } = useAppStore()

  const [exams, setExams] = useState<{ id: number; name: string }[]>([])
  const [streams, setStreams] = useState<{ id: number; stream_name: string }[]>([])

  const [selectedExam, setSelectedExam] = useState<number>(0)
  const [selectedStream, setSelectedStream] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null)
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([])
  const [subjectPerformance, setSubjectPerformance] = useState<SubjectPerformance[]>([])
  const [strugglingStudents, setStrugglingStudents] = useState<StrugglingStu[]>([])

  const loadInitialData = React.useCallback(async () => {
    try {
      const [examsData, streamsData] = await Promise.all([
        globalThis.electronAPI.getExams({ academicYearId: currentAcademicYear?.id, termId: currentTerm?.id }),
        globalThis.electronAPI.getStreams()
      ])

      setExams(examsData || [])
      setStreams(streamsData || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [currentAcademicYear, currentTerm])

  useEffect(() => {
    loadInitialData().catch((err: unknown) => console.error('Failed to load initial data:', err))
  }, [loadInitialData])

  const handleAnalyze = async () => {
    if (!selectedExam || !selectedStream) {
      alert('Please select an exam and stream')
      return
    }

    setLoading(true)
    try {
      const [summary, grades, subjects, struggling] = await Promise.all([
        globalThis.electronAPI.getPerformanceSummary({
          examId: selectedExam,
          streamId: selectedStream
        }),
        globalThis.electronAPI.getGradeDistribution({
          examId: selectedExam,
          streamId: selectedStream
        }),
        globalThis.electronAPI.getSubjectPerformance({
          examId: selectedExam,
          streamId: selectedStream
        }),
        globalThis.electronAPI.getStrugglingStudents({
          examId: selectedExam,
          streamId: selectedStream,
          threshold: 40
        })
      ])

      setPerformanceSummary(summary)
      setGradeDistribution(grades || [])
      setSubjectPerformance(subjects || [])
      setStrugglingStudents(struggling || [])
    } catch (error) {
      console.error('Failed to analyze exam:', error)
      alert('Failed to analyze exam data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportAnalytics = async () => {
    if (!performanceSummary) {
      alert('Please analyze an exam first')
      return
    }

    try {
      await exportToPDF({
        filename: `exam-analytics-${selectedExam}-${selectedStream}`,
        title: 'Exam Analytics - Subject Performance',
        subtitle: `Mean: ${performanceSummary.mean_score.toFixed(2)} | Pass Rate: ${performanceSummary.pass_rate.toFixed(1)}% | Students: ${performanceSummary.total_students}`,
        columns: [
          { key: 'subject_name', header: 'Subject', width: 70 },
          { key: 'mean_score', header: 'Mean Score', width: 30, align: 'right' },
          { key: 'pass_rate', header: 'Pass Rate', width: 30, align: 'right' },
          { key: 'difficulty_index', header: 'Difficulty', width: 30, align: 'right' },
          { key: 'discrimination_index', header: 'Discrimination', width: 35, align: 'right' }
        ],
        data: subjectPerformance.map((s) => ({
          subject_name: s.subject_name,
          mean_score: s.mean_score.toFixed(2),
          pass_rate: `${s.pass_rate.toFixed(1)}%`,
          difficulty_index: s.difficulty_index.toFixed(2),
          discrimination_index: s.discrimination_index.toFixed(2)
        }))
      })
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Failed to export analytics')
    }
  }

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280']

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Exam Analytics"
        subtitle="Detailed exam performance analysis and insights"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Exam Analytics' }]}
      />

      {/* Selection */}
      <div className="premium-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Select
            label="Exam"
            value={selectedExam}
            onChange={(val) => setSelectedExam(Number(val))}
            options={[
              { value: 0, label: 'Select exam...' },
              ...exams.map((e) => ({ value: e.id, label: e.name }))
            ]}
          />
          <Select
            label="Stream"
            value={selectedStream}
            onChange={(val) => setSelectedStream(Number(val))}
            options={[
              { value: 0, label: 'Select stream...' },
              ...streams.map((s) => ({ value: s.id, label: s.stream_name }))
            ]}
          />
          <div className="flex items-end gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
            {performanceSummary && (
              <button
                onClick={handleExportAnalytics}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Download size={18} />
                Export
              </button>
            )}
          </div>
        </div>
      </div>

      {performanceSummary && (
        <>
          {/* Performance Summary Cards */}
          <div className="premium-card">
            <h3 className="text-lg font-semibold mb-6">Performance Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-white/5">
                <p className="text-sm text-foreground/60">Mean Score</p>
                <p className="text-2xl font-bold">{performanceSummary.mean_score.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5">
                <p className="text-sm text-foreground/60">Pass Rate</p>
                <p className="text-2xl font-bold text-green-400">{performanceSummary.pass_rate.toFixed(1)}%</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5">
                <p className="text-sm text-foreground/60">Top Performer</p>
                <p className="text-lg font-bold">{performanceSummary.top_performer}</p>
                <p className="text-xs text-foreground/60">{performanceSummary.top_performer_score.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5">
                <p className="text-sm text-foreground/60">Total Students</p>
                <p className="text-2xl font-bold">{performanceSummary.total_students}</p>
              </div>
            </div>
          </div>

          {/* Grade Distribution */}
          {gradeDistribution.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="premium-card">
                <h3 className="text-lg font-semibold mb-4">Grade Distribution</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gradeDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ grade, percentage }) => `${grade} (${percentage.toFixed(1)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {gradeDistribution.map((item, index) => (
                          <Cell key={item.grade} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="premium-card">
                <h3 className="text-lg font-semibold mb-4">Grade Breakdown</h3>
                <div className="space-y-3">
                  {gradeDistribution.map((item) => (
                    <div key={item.grade} className="flex items-center justify-between">
                      <span className="font-medium">{item.grade}</span>
                      <div className="flex-1 mx-4">
                        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm text-foreground/60">{item.count} ({item.percentage.toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Subject Performance */}
          {subjectPerformance.length > 0 && (
            <div className="premium-card">
              <h3 className="text-lg font-semibold mb-4">Subject Performance Analysis</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="subject_name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }}
                      formatter={(value: number) => value.toFixed(2)}
                    />
                    <Legend />
                    <Bar dataKey="mean_score" fill="#10b981" name="Mean Score" />
                    <Bar dataKey="pass_rate" fill="#3b82f6" name="Pass Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Subject</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Mean Score</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Pass Rate</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Difficulty</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Discrimination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {subjectPerformance.map((subject) => (
                      <tr key={subject.subject_name} className="hover:bg-white/[0.02]">
                        <td className="py-3 font-medium">{subject.subject_name}</td>
                        <td className="py-3">{subject.mean_score.toFixed(2)}</td>
                        <td className="py-3">{subject.pass_rate.toFixed(1)}%</td>
                        <td className="py-3">
                          <span className={`text-xs font-semibold ${subject.difficulty_index > 50 ? 'text-red-400' : 'text-green-400'
                            }`}>
                            {subject.difficulty_index.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3">{subject.discrimination_index.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Struggling Students */}
          {strugglingStudents.length > 0 && (
            <div className="premium-card border-l-4 border-amber-500">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" />
                Students Needing Intervention ({strugglingStudents.length})
              </h3>
              <div className="space-y-3">
                {strugglingStudents.map((student) => (
                  <div key={student.student_id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{student.student_name}</p>
                        <p className="text-xs text-foreground/60">Adm: {student.admission_number}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${student.average_score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {student.average_score.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/70">{student.recommended_action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!performanceSummary && !loading && (
        <div className="premium-card flex items-center justify-center min-h-[400px]">
          <div className="text-center text-foreground/40">
            <p>Select an exam and stream, then click "Analyze" to view performance analytics</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExamAnalytics
