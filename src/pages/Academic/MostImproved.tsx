
import { Download, Mail, Award } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore, useAuthStore } from '../../stores'

interface ImprovedStudent {
  student_id: number
  admission_number: string
  student_name: string
  previous_term_average: number
  current_term_average: number
  improvement_percentage: number
  improvement_points: number
  grade_improvement: string
  subjects_improved: number
  subjects_declined: number
}

const MostImproved = () => {
  const { currentAcademicYear, currentTerm } = useAppStore()
  const { user } = useAuthStore()

  const [terms, setTerms] = useState<{ id: number; name: string }[]>([])
  const [streams, setStreams] = useState<{ id: number; stream_name: string }[]>([])

  const [selectedCurrentTerm, setSelectedCurrentTerm] = useState<number>(0)
  const [selectedComparisonTerm, setSelectedComparisonTerm] = useState<number>(0)
  const [selectedStream, setSelectedStream] = useState<number>(0)
  const [minimumImprovement, setMinimumImprovement] = useState<number>(5)

  const [improvedStudents, setImprovedStudents] = useState<ImprovedStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAward, setSelectedAward] = useState<string>('most_improved')

  const awardCategories = [
    { value: 'most_improved', label: 'Most Improved Overall' },
    { value: 'comeback', label: 'Comeback Student (E to A)' },
    { value: 'subject_improvement', label: 'Subject Excellence' },
    { value: 'consistent_improver', label: 'Consistent Improver' }
  ]

  const loadInitialData = useCallback(async () => {
    try {
      if (currentAcademicYear) {
        const [termsData, streamsData] = await Promise.all([
          globalThis.electronAPI.getTermsByYear(currentAcademicYear.id),
          globalThis.electronAPI.getStreams()
        ])

        setTerms(termsData?.map(t => ({ id: t.id, name: t.term_name })) || [])
        setStreams(streamsData || [])

        // Auto-select current term as comparison and previous term
        if (currentTerm && termsData && termsData.length > 0) {
          setSelectedCurrentTerm(currentTerm.id)
          const previousTerm = termsData.find(t => t.id !== currentTerm.id)
          if (previousTerm) {
            setSelectedComparisonTerm(previousTerm.id)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [currentAcademicYear, currentTerm])

  useEffect(() => {
    loadInitialData().catch((err: unknown) => console.error('Failed to load initial data:', err))
  }, [loadInitialData])

  const handleGenerateMostImproved = async () => {
    if (!selectedCurrentTerm || !selectedComparisonTerm) {
      alert('Please select both current and comparison terms')
      return
    }

    setLoading(true)
    try {
      const students = await globalThis.electronAPI.getMostImprovedStudents({
        academicYearId: currentAcademicYear!.id,
        currentTermId: selectedCurrentTerm,
        comparisonTermId: selectedComparisonTerm,
        streamId: selectedStream || undefined,
        minimumImprovement
      })

      setImprovedStudents(students || [])
    } catch (error) {
      console.error('Failed to get most improved students:', error)
      alert('Failed to generate list')
    } finally {
      setLoading(false)
    }
  }

  const handleAwardCertificates = async () => {
    if (improvedStudents.length === 0) {
      alert('Please generate a list first')
      return
    }

    try {
      // Generate certificates for selected students
      await Promise.all(
        improvedStudents.map(student =>
          globalThis.electronAPI.generateCertificate({
            studentId: student.student_id,
            studentName: student.student_name,
            awardCategory: selectedAward,
            academicYearId: currentAcademicYear!.id,
            improvementPercentage: student.improvement_percentage
          })
        )
      )
      alert(`${improvedStudents.length} certificates generated successfully!`)
    } catch (error) {
      console.error('Failed to generate certificates:', error)
      alert('Failed to generate certificates')
    }
  }

  const handleEmailParents = async () => {
    if (improvedStudents.length === 0) {
      alert('Please generate a list first')
      return
    }

    try {
      if (!user?.id) {
        alert('Please sign in again to send emails.')
        return
      }
      await globalThis.electronAPI.emailParents({
        students: improvedStudents,
        awardCategory: selectedAward,
        templateType: 'improvement_award'
      }, user.id)
      alert(`Emails sent to ${improvedStudents.length} parents!`)
    } catch (error) {
      console.error('Failed to send emails:', error)
      alert('Failed to send emails')
    }
  }

  const handleExportList = () => {
    if (improvedStudents.length === 0) {
      alert('Please generate a list first')
      return
    }

    const csvContent = [
      ['Position', 'Admission No', 'Student Name', 'Previous Average', 'Current Average', 'Improvement %', 'Improvement Points', 'Grade Change'],
      ...improvedStudents.map((item, index) => [
        index + 1,
        item.admission_number,
        item.student_name,
        item.previous_term_average.toFixed(2),
        item.current_term_average.toFixed(2),
        item.improvement_percentage.toFixed(2),
        item.improvement_points.toFixed(2),
        item.grade_improvement
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = globalThis.URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = `Most_Improved_Students.csv`
    a.click()
  }

  const renderMostImprovedContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 text-foreground/40">
          <p>Analyzing improvements...</p>
        </div>
      )
    }

    if (improvedStudents.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-foreground/40">
          <p>Select terms and click "Identify Most Improved" to generate list</p>
        </div>
      )
    }

    return (
      <div>
        <div className="mb-4 pb-4 border-b border-white/10">
          <h2 className="text-xl font-bold">Most Improved Students</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Total: {improvedStudents.length} students | Minimum Improvement: {minimumImprovement}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-4 pt-2 font-bold text-foreground/60">Rank</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Adm No</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Student Name</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Previous Avg</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Current Avg</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Improvement</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60">Grade Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {improvedStudents.map((student, index) => (
                <tr key={student.student_id} className="hover:bg-white/[0.02]">
                  <td className="py-4 pr-4">
                    <span className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm">
                      #{index + 1}
                    </span>
                  </td>
                  <td className="py-4 pr-4">{student.admission_number}</td>
                  <td className="py-4 pr-4 font-medium">{student.student_name}</td>
                  <td className="py-4 pr-4">{student.previous_term_average.toFixed(2)}</td>
                  <td className="py-4 pr-4">{student.current_term_average.toFixed(2)}</td>
                  <td className="py-4 pr-4">
                    <span className="inline-block px-2 py-1 rounded bg-green-500/20 text-green-400 font-bold">
                      +{student.improvement_percentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-sm">{student.grade_improvement}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Most Improved Students"
        subtitle="Identify and award students with exceptional improvement"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Most Improved' }]}
      />

      <div className="premium-card">
        <h3 className="text-lg font-semibold mb-6">Selection Criteria</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Select
            label="Current Term"
            value={selectedCurrentTerm}
            onChange={(val) => setSelectedCurrentTerm(Number(val))}
            options={[
              { value: 0, label: 'Select term...' },
              ...terms.map((t) => ({ value: t.id, label: t.name }))
            ]}
          />
          <Select
            label="Comparison Term"
            value={selectedComparisonTerm}
            onChange={(val) => setSelectedComparisonTerm(Number(val))}
            options={[
              { value: 0, label: 'Select term...' },
              ...terms.map((t) => ({ value: t.id, label: t.name }))
            ]}
          />
          <Select
            label="Stream"
            value={selectedStream}
            onChange={(val) => setSelectedStream(Number(val))}
            options={[
              { value: 0, label: 'All Streams' },
              ...streams.map((s) => ({ value: s.id, label: s.stream_name }))
            ]}
          />
          <div>
            <label htmlFor="field-215" className="block text-sm font-medium mb-2">Min. Improvement (%)</label>
            <input id="field-215"
              type="number"
              value={minimumImprovement}
              onChange={(e) => setMinimumImprovement(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10"
              min="0"
              max="100"
            />
          </div>
        </div>

        <button
          onClick={handleGenerateMostImproved}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Analyzing...' : 'Identify Most Improved'}
        </button>
      </div>

      {improvedStudents.length > 0 && (
        <div className="premium-card">
          <h3 className="text-lg font-semibold mb-6">Award Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Award Category"
              value={selectedAward}
              onChange={(val) => setSelectedAward(String(val))}
              options={awardCategories}
            />
            <button
              onClick={handleAwardCertificates}
              className="btn btn-secondary flex items-center gap-2 h-[42px] mt-6"
            >
              <Award size={18} />
              Generate Certificates
            </button>
            <button
              onClick={handleEmailParents}
              className="btn btn-secondary flex items-center gap-2 h-[42px] mt-6"
            >
              <Mail size={18} />
              Email Parents
            </button>
            <button
              onClick={handleExportList}
              className="btn btn-secondary flex items-center gap-2 h-[42px] mt-6"
            >
              <Download size={18} />
              Export List
            </button>
          </div>
        </div>
      )}

      <div className="premium-card min-h-[400px]">
        {renderMostImprovedContent()}
      </div>
    </div>
  )
}

export default MostImproved
