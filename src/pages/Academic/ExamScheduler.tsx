
import { Download, AlertTriangle, CheckCircle } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'

interface ExamSlot {
  id: number
  subject_id: number
  subject_name: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  venue_id: number
  venue_name: string
  max_capacity: number
  enrolled_students: number
}

interface ClashReport {
  subject1_id: number
  subject1_name: string
  subject2_id: number
  subject2_name: string
  clash_type: string
  affected_students: number
}

interface TimetableStats {
  total_slots: number
  total_students: number
  venues_used: number
  average_capacity_usage: number
}

interface TimetableResult {
  slots: ExamSlot[]
  clashes: ClashReport[]
  stats: TimetableStats
}

const ExamScheduler = () => {
  const { currentAcademicYear, currentTerm } = useAppStore()

  const [exams, setExams] = useState<{ id: number; name: string }[]>([])

  const [selectedExam, setSelectedExam] = useState<number>(0)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [slots, setSlots] = useState<ExamSlot[]>([])
  const [clashes, setClashes] = useState<ClashReport[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<TimetableStats | null>(null)
  const schedulerDisabled = false

  const loadInitialData = useCallback(async () => {
    try {
      const examsData = await globalThis.electronAPI.getExams({ academicYearId: currentAcademicYear?.id, termId: currentTerm?.id })
      setExams(examsData || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [currentAcademicYear, currentTerm])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  const handleGenerateTimetable = async () => {
    if (schedulerDisabled) {
      alert('Exam scheduler is temporarily unavailable. Please try again after the scheduling engine is enabled.')
      return
    }
    if (!selectedExam || !startDate || !endDate) {
      alert('Please select an exam and date range')
      return
    }

    setLoading(true)
    try {
      const result = await globalThis.electronAPI.generateExamTimetable({
        examId: selectedExam,
        startDate,
        endDate,
        slots: slots.length || 20 // Default number of slots
      }) as TimetableResult

      setSlots(result?.slots || [])
      setClashes(result?.clashes || [])
      setStats(result?.stats || null)
    } catch (error) {
      console.error('Failed to generate timetable:', error)
      alert('Failed to generate exam timetable')
    } finally {
      setLoading(false)
    }
  }

  const handleDetectClashes = async () => {
    if (schedulerDisabled) {
      alert('Clash detection is temporarily unavailable.')
      return
    }
    if (!selectedExam) {
      alert('Please select an exam first')
      return
    }

    setLoading(true)
    try {
      const clashData = await globalThis.electronAPI.detectExamClashes({ examId: selectedExam }) as ClashReport[]
      setClashes(clashData || [])

      if (clashData?.length === 0) {
        alert('No clashes detected!')
      }
    } catch (error) {
      console.error('Failed to detect clashes:', error)
      alert('Failed to detect clashes')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    if (schedulerDisabled) {
      alert('PDF export is temporarily unavailable.')
      return
    }
    if (slots.length === 0) {
      alert('Please generate a timetable first')
      return
    }

    try {
      await globalThis.electronAPI.exportExamTimetableToPDF({
        examId: selectedExam,
        slots
      })
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert('Failed to export PDF')
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Exam Scheduler"
        subtitle="Generate timetables, allocate venues, detect clashes"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Exam Scheduler' }]}
      />

      {/* Configuration */}
      <div className="premium-card">
        {schedulerDisabled && (
          <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm">
            The exam scheduling engine is currently disabled. Generation, clash detection, and PDF export are unavailable.
          </div>
        )}
        <h3 className="text-lg font-semibold mb-6">Timetable Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Select
            label="Exam"
            value={selectedExam}
            onChange={(val) => setSelectedExam(Number(val))}
            options={[
              { value: 0, label: 'Select exam...' },
              ...exams.map((e) => ({ value: e.id, label: e.name }))
            ]}
          />
          <div>
            <label htmlFor="field-176" className="block text-sm font-medium mb-2">Start Date</label>
            <input id="field-176"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10"
            />
          </div>
          <div>
            <label htmlFor="field-185" className="block text-sm font-medium mb-2">End Date</label>
            <input id="field-185"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerateTimetable}
              disabled={loading || schedulerDisabled}
              className="btn btn-primary w-full"
            >
              {loading ? 'Generating...' : 'Generate Timetable'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleDetectClashes}
            disabled={loading || !selectedExam || schedulerDisabled}
            className="btn btn-secondary flex items-center gap-2 justify-center"
          >
            <AlertTriangle size={18} />
            Detect Clashes
          </button>
          <button
            onClick={handleExportPDF}
            disabled={slots.length === 0 || schedulerDisabled}
            className="btn btn-secondary flex items-center gap-2 justify-center"
          >
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="premium-card">
          <h3 className="text-lg font-semibold mb-4">Timetable Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Total Slots</p>
              <p className="text-2xl font-bold">{stats.total_slots}</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Total Students</p>
              <p className="text-2xl font-bold">{stats.total_students}</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Venues Used</p>
              <p className="text-2xl font-bold">{stats.venues_used}</p>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <p className="text-sm text-foreground/60">Avg Capacity Usage</p>
              <p className="text-2xl font-bold">{stats.average_capacity_usage?.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Clash Warnings */}
      {clashes.length > 0 && (
        <div className="premium-card border-l-4 border-red-500">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            Scheduling Clashes Detected
          </h3>
          <div className="space-y-3">
            {clashes.map((clash) => (
              <div key={`${clash.subject1_id}-${clash.subject2_id}-${clash.clash_type}`} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="font-semibold">
                  {clash.subject1_name} vs {clash.subject2_name}
                </p>
                <p className="text-sm text-foreground/60 mt-1">
                  Type: {clash.clash_type} | Affected Students: {clash.affected_students}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timetable */}
      {slots.length > 0 && (
        <div className="premium-card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle size={20} className="text-green-500" />
            Generated Timetable
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Subject</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Date</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Time</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Venue</th>
                  <th className="pb-4 pt-2 font-bold text-foreground/60">Capacity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {slots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-white/[0.02]">
                    <td className="py-4 pr-4 font-medium">{slot.subject_name}</td>
                    <td className="py-4 pr-4">{new Date(slot.start_date).toLocaleDateString()}</td>
                    <td className="py-4 pr-4">{slot.start_time} - {slot.end_time}</td>
                    <td className="py-4 pr-4">{slot.venue_name}</td>
                    <td className="py-4 pr-4">
                      <span className="px-2 py-1 rounded text-sm bg-white/10">
                        {slot.enrolled_students}/{slot.max_capacity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExamScheduler
