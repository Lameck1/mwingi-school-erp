
import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { Download, TrendingUp } from 'lucide-react'

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

interface TermComparison {
  term_name: string
  mean_score: number
  pass_rate: number
  improvement?: number
}

const ReportCardAnalytics = () => {
  const { currentAcademicYear, currentTerm } = useAppStore()

  const [exams, setExams] = useState<{ id: number; name: string }[]>([])
  const [streams, setStreams] = useState<{ id: number; stream_name: string }[]>([])

  const [selectedExam, setSelectedExam] = useState<number>(0)
  const [selectedStream, setSelectedStream] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null)
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([])
  const [subjectPerformance, setSubjectPerformance] = useState<SubjectPerformance[]>([])
  const [termComparison, setTermComparison] = useState<TermComparison[]>([])

  const loadInitialData = useCallback(async () => {
    try {
      const [examsData, streamsData] = await Promise.all([
        window.electronAPI.getExams({ academicYearId: currentAcademicYear?.id, termId: currentTerm?.id }),
        window.electronAPI.getStreams()
      ])

      setExams(examsData || [])
      setStreams(streamsData || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [currentAcademicYear, currentTerm])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleAnalyze = async () => {
    if (!selectedExam || !selectedStream) {
      alert('Please select an exam and stream')
      return
    }

    setLoading(true)
    try {
      const [summary, grades, subjects, comparison] = await Promise.all([
        window.electronAPI.getPerformanceSummary({
          examId: selectedExam,
          streamId: selectedStream
        }),
        window.electronAPI.getGradeDistribution({
          examId: selectedExam,
          streamId: selectedStream
        }),
        window.electronAPI.getSubjectPerformance({
          examId: selectedExam,
          streamId: selectedStream
        }),
        window.electronAPI.getTermComparison({
          examId: selectedExam,
          streamId: selectedStream
        })
      ])

      setPerformanceSummary(summary)
      setGradeDistribution(grades || [])
      setSubjectPerformance(subjects || [])
      setTermComparison(comparison || [])
    } catch (error) {
      console.error('Failed to analyze:', error)
      alert('Failed to analyze report cards')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!performanceSummary) {
      alert('Please analyze first')
      return
    }

    try {
      await window.electronAPI.exportReportCardAnalyticsToPDF({
        examId: selectedExam,
        summary: performanceSummary,
        grades: gradeDistribution,
        subjects: subjectPerformance
      })
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Failed to export')
    }
  }

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280']

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Report Card Analytics"
        subtitle="Class performance insights and trends"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Report Card Analytics' }]}
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
                onClick={handleExport}
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
          {/* Summary Cards */}
          <div className="premium-card">
            <h3 className="text-lg font-semibold mb-6">Performance Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30">
                <p className="text-xs text-foreground/60">Mean Score</p>
                <p className="text-2xl font-bold text-blue-400">{performanceSummary.mean_score.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30">
                <p className="text-xs text-foreground/60">Pass Rate</p>
                <p className="text-2xl font-bold text-green-400">{performanceSummary.pass_rate.toFixed(1)}%</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30">
                <p className="text-xs text-foreground/60">Total Students</p>
                <p className="text-2xl font-bold text-amber-400">{performanceSummary.total_students}</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30">
                <p className="text-xs text-foreground/60">Top Performer</p>
                <p className="text-sm font-bold text-purple-400">{performanceSummary.top_performer.split(' ')[0]}</p>
                <p className="text-xs text-foreground/60">{performanceSummary.top_performer_score.toFixed(1)}</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/30">
                <p className="text-xs text-foreground/60">Pass/Fail</p>
                <p className="text-lg font-bold"><span className="text-green-400">{performanceSummary.pass_count}</span>/<span className="text-red-400">{performanceSummary.fail_count}</span></p>
              </div>
            </div>
          </div>

          {/* Grade Distribution & Subject Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {gradeDistribution.length > 0 && (
              <div className="premium-card">
                <h3 className="text-lg font-semibold mb-4">Grade Distribution</h3>
                <div className="space-y-3">
                  {gradeDistribution.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="font-medium w-12">{item.grade}</span>
                      <div className="flex-1 mx-4">
                        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r"
                            style={{
                              backgroundImage: `linear-gradient(to right, ${COLORS[idx % COLORS.length]}, ${COLORS[(idx + 1) % COLORS.length]})`,
                              width: `${item.percentage}%`
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-sm text-foreground/60 w-20 text-right">{item.count} ({item.percentage.toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subjectPerformance.length > 0 && (
              <div className="premium-card">
                <h3 className="text-lg font-semibold mb-4">Subject Performance</h3>
                <div className="space-y-2">
                  {subjectPerformance.slice(0, 5).map((subject, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-white/5">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-sm">{subject.subject_name}</span>
                        <span className="text-sm font-bold text-blue-400">{subject.mean_score.toFixed(1)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ width: `${(subject.mean_score / 100) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Subject Analysis Details */}
          {subjectPerformance.length > 0 && (
            <div className="premium-card">
              <h3 className="text-lg font-semibold mb-4">Detailed Subject Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-3 pt-2 font-bold text-foreground/60">Subject</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60 text-right">Mean</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60 text-right">Pass %</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60 text-right">Difficulty</th>
                      <th className="pb-3 pt-2 font-bold text-foreground/60 text-right">Discrimination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {subjectPerformance.map((subject, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 font-medium">{subject.subject_name}</td>
                        <td className="py-3 text-right font-bold">{subject.mean_score.toFixed(1)}</td>
                        <td className="py-3 text-right">
                          <span className={`${subject.pass_rate >= 70 ? 'text-green-400' : 'text-red-400'}`}>
                            {subject.pass_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${subject.difficulty_index > 50 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                            }`}>
                            {subject.difficulty_index.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 text-right">{subject.discrimination_index.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Term Comparison */}
          {termComparison.length > 1 && (
            <div className="premium-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-500" />
                Term-to-Term Comparison
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={termComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="term_name" />
                    <YAxis />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="mean_score" stroke="#3b82f6" strokeWidth={2} name="Mean Score" />
                    <Line type="monotone" dataKey="pass_rate" stroke="#10b981" strokeWidth={2} name="Pass Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {!performanceSummary && !loading && (
        <div className="premium-card flex items-center justify-center min-h-[400px]">
          <div className="text-center text-foreground/40">
            <p>Select an exam and stream, then click "Analyze" to view analytics</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportCardAnalytics
