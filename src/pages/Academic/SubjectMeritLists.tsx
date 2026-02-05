
import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'
import { Download } from 'lucide-react'
import { SubjectDifficulty } from '../../types/electron-api/AcademicAPI'

interface SubjectRanking {
  position: number
  student_name: string
  admission_number: string
  marks: number
  percentage: number
  grade: string
}


const SubjectMeritLists = () => {
  const { currentAcademicYear, currentTerm } = useAppStore()

  const [exams, setExams] = useState<{ id: number; name: string }[]>([])
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([])
  const [streams, setStreams] = useState<{ id: number; stream_name: string }[]>([])

  const [selectedExam, setSelectedExam] = useState<number>(0)
  const [selectedSubject, setSelectedSubject] = useState<number>(0)
  const [selectedStream, setSelectedStream] = useState<number>(0)

  const [rankings, setRankings] = useState<SubjectRanking[]>([])
  const [difficulty, setDifficulty] = useState<SubjectDifficulty | null>(null)
  const [loading, setLoading] = useState(false)

  const loadInitialData = useCallback(async () => {
    try {
      const [examsData, streamsData, subjectsData] = await Promise.all([
        window.electronAPI.getExams({ academicYearId: currentAcademicYear?.id, termId: currentTerm?.id }),
        window.electronAPI.getStreams(),
        window.electronAPI.getAcademicSubjects()
      ])

      setExams(examsData || [])
      setStreams(streamsData || [])
      setSubjects(subjectsData || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [currentAcademicYear, currentTerm])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleGenerateMeritList = async () => {
    if (!selectedExam || !selectedSubject || !selectedStream) {
      alert('Please select an exam, subject, and stream')
      return
    }

    setLoading(true)
    try {
      const [rankings_, difficulty_] = await Promise.all([
        window.electronAPI.getSubjectMeritList({
          examId: selectedExam,
          subjectId: selectedSubject,
          streamId: selectedStream
        }),
        window.electronAPI.getSubjectDifficulty({
          examId: selectedExam,
          subjectId: selectedSubject,
          streamId: selectedStream
        })
      ])

      setRankings(rankings_ || [])
      setDifficulty(difficulty_)
    } catch (error) {
      console.error('Failed to generate merit list:', error)
      alert('Failed to generate merit list')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCSV = () => {
    if (rankings.length === 0) {
      alert('Please generate a merit list first')
      return
    }

    const subjectName = subjects.find(s => s.id === selectedSubject)?.name || 'Subject'
    const csvContent = [
      ['Position', 'Admission No', 'Student Name', 'Marks', 'Percentage', 'Grade'],
      ...rankings.map(item => [
        item.position,
        item.admission_number,
        item.student_name,
        item.marks,
        item.percentage.toFixed(1),
        item.grade
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${subjectName}_Merit_List.csv`
    a.click()
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Subject Merit Lists"
        subtitle="Top performers in each subject with difficulty analysis"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Subject Merit Lists' }]}
      />

      <div className="premium-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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
            label="Subject"
            value={selectedSubject}
            onChange={(val) => setSelectedSubject(Number(val))}
            options={[
              { value: 0, label: 'Select subject...' },
              ...subjects.map((s) => ({ value: s.id, label: s.name }))
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
              onClick={handleGenerateMeritList}
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>
        </div>

        {difficulty && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Mean Score</p>
              <p className="text-2xl font-bold">{difficulty.mean_score.toFixed(1)}</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Pass Rate</p>
              <p className="text-2xl font-bold">{difficulty.pass_rate.toFixed(1)}%</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Difficulty</p>
              <p className="text-2xl font-bold">{difficulty.difficulty_index.toFixed(1)}</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Discrimination</p>
              <p className="text-2xl font-bold">{difficulty.discrimination_index.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>

      {rankings.length > 0 && (
        <div className="premium-card">
          <div className="flex gap-3 pb-4 border-b border-white/10">
            <button
              onClick={handleExportCSV}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>
      )}

      <div className="premium-card min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-foreground/40">
            <p>Loading...</p>
          </div>
        ) : rankings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-foreground/40">
            <p>Select exam, subject, and stream to view rankings</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Position</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Admission No</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Student Name</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Marks</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Percentage</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rankings.map((row) => (
                  <tr key={`${row.admission_number}-${row.position}`} className="hover:bg-white/[0.02]">
                    <td className="py-4 pr-4 font-semibold">{row.position}</td>
                    <td className="py-4 pr-4">{row.admission_number}</td>
                    <td className="py-4 pr-4">{row.student_name}</td>
                    <td className="py-4 pr-4">{row.marks}</td>
                    <td className="py-4 pr-4">{row.percentage.toFixed(1)}%</td>
                    <td className="py-4 pr-4">
                      <span className="px-2 py-1 rounded text-sm font-semibold" style={{
                        backgroundColor: row.marks >= 80 ? '#10b981' : row.marks >= 60 ? '#3b82f6' : '#ef4444',
                        color: 'white'
                      }}>
                        {row.grade}
                      </span>
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

export default SubjectMeritLists
