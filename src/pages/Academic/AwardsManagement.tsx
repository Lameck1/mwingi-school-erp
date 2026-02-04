
import React, { useState, useEffect } from 'react'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore } from '../../stores'
import { Plus, Trash2, CheckCircle, Clock } from 'lucide-react'

interface StudentAward {
  id: number
  student_id: number
  student_name: string
  admission_number: string
  award_category_id: number
  category_name: string
  award_date: string
  approval_status: 'pending' | 'approved' | 'rejected'
  certificate_number?: string
  remarks?: string
}

interface AwardCategory {
  id: number
  name: string
  category_type: string
  description: string
}

const AwardsManagement = () => {
  const { currentAcademicYear, currentTerm, currentUser } = useAppStore()

  const [awards, setAwards] = useState<StudentAward[]>([])
  const [categories, setCategories] = useState<AwardCategory[]>([])
  const [students, setStudents] = useState<{ id: number; name: string; admission_number: string }[]>([])

  const [selectedStudent, setSelectedStudent] = useState<number>(0)
  const [selectedCategory, setSelectedCategory] = useState<number>(0)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<number>(0)

  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedAwardForApproval, setSelectedAwardForApproval] = useState<number | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [currentAcademicYear, currentTerm])

  const loadInitialData = async () => {
    try {
      const [awardData, categoryData, studentData] = await Promise.all([
        window.electronAPI.getAwards({
          academicYearId: currentAcademicYear?.id,
          termId: currentTerm?.id
        }),
        window.electronAPI.getAwardCategories(),
        window.electronAPI.getStudents({ streamId: undefined })
      ])

      setAwards(awardData || [])
      setCategories(categoryData || [])
      setStudents(studentData || [])
    } catch (error) {
      console.error('Failed to load awards:', error)
    }
  }

  const handleAwardStudent = async () => {
    if (!selectedStudent || !selectedCategory) {
      alert('Please select a student and award category')
      return
    }

    setLoading(true)
    try {
      const award = await window.electronAPI.awardStudent({
        studentId: selectedStudent,
        categoryId: selectedCategory,
        academicYearId: currentAcademicYear!.id,
        termId: currentTerm?.id,
        awardedByUserId: currentUser?.id,
        remarks: ''
      })

      setAwards([...awards, award])
      setSelectedStudent(0)
      setSelectedCategory(0)
      setShowForm(false)
      alert('Award assigned successfully!')
    } catch (error) {
      console.error('Failed to assign award:', error)
      alert('Failed to assign award')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAward = async (awardId: number) => {
    setLoading(true)
    try {
      await window.electronAPI.approveAward({
        awardId,
        approvedByUserId: currentUser?.id,
        remarks: 'Approved'
      })

      // Reload awards
      const awardData = await window.electronAPI.getAwards({
        academicYearId: currentAcademicYear?.id,
        termId: currentTerm?.id
      })
      setAwards(awardData || [])
      setSelectedAwardForApproval(null)
      alert('Award approved successfully!')
    } catch (error) {
      console.error('Failed to approve award:', error)
      alert('Failed to approve award')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAward = async (awardId: number) => {
    if (!confirm('Are you sure you want to delete this award?')) return

    setLoading(true)
    try {
      await window.electronAPI.deleteAward({ awardId })
      setAwards(awards.filter(a => a.id !== awardId))
      alert('Award deleted successfully!')
    } catch (error) {
      console.error('Failed to delete award:', error)
      alert('Failed to delete award')
    } finally {
      setLoading(false)
    }
  }

  const filteredAwards = awards.filter(award => {
    if (filterStatus !== 'all' && award.approval_status !== filterStatus) return false
    if (filterCategory !== 0 && award.award_category_id !== filterCategory) return false
    return true
  })

  const categoryMap = new Map(categories.map(c => [c.id, c]))

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Awards Management"
        subtitle="Manage student awards and recognitions"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Awards' }]}
      />

      <div className="premium-card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Award Categories</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.slice(0, 6).map(cat => (
            <div key={cat.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="font-semibold text-sm">{cat.name}</p>
              <p className="text-xs text-foreground/60 mt-1">{cat.category_type.replace(/_/g, ' ')}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Assign Award</h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            New Award
          </button>
        </div>

        {showForm && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 rounded-lg bg-white/5 mb-6">
            <Select
              label="Student"
              value={selectedStudent}
              onChange={(val) => setSelectedStudent(Number(val))}
              options={[
                { value: 0, label: 'Select student...' },
                ...students.map(s => ({ value: s.id, label: `${s.name} (${s.admission_number})` }))
              ]}
            />
            <Select
              label="Award Category"
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(Number(val))}
              options={[
                { value: 0, label: 'Select category...' },
                ...categories.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <div className="flex items-end gap-3">
              <button
                onClick={handleAwardStudent}
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading ? 'Assigning...' : 'Assign Award'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="premium-card">
        <div className="flex gap-4 mb-6">
          <Select
            label="Status"
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending Approval' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }
            ]}
          />
          <Select
            label="Category"
            value={filterCategory}
            onChange={(val) => setFilterCategory(Number(val))}
            options={[
              { value: 0, label: 'All Categories' },
              ...categories.map(c => ({ value: c.id, label: c.name }))
            ]}
          />
        </div>

        <div className="space-y-4">
          {filteredAwards.length === 0 ? (
            <div className="text-center py-12 text-foreground/40">
              <p>No awards found</p>
            </div>
          ) : (
            filteredAwards.map(award => (
              <div
                key={award.id}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold">{award.student_name}</h4>
                    <span className="text-xs px-2 py-1 rounded bg-white/10 text-foreground/60">
                      {award.admission_number}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/60 mb-2">
                    {categoryMap.get(award.award_category_id)?.name}
                  </p>
                  <div className="flex gap-4 text-xs text-foreground/50">
                    <span>Awarded: {new Date(award.award_date).toLocaleDateString()}</span>
                    {award.certificate_number && <span>Certificate: {award.certificate_number}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {award.approval_status === 'pending' && (
                      <div className="flex items-center gap-1 text-amber-400">
                        <Clock size={16} />
                        <span className="text-xs font-semibold">Pending</span>
                      </div>
                    )}
                    {award.approval_status === 'approved' && (
                      <div className="flex items-center gap-1 text-green-400">
                        <CheckCircle size={16} />
                        <span className="text-xs font-semibold">Approved</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {award.approval_status === 'pending' && (
                      <button
                        onClick={() => handleApproveAward(award.id)}
                        disabled={loading}
                        className="btn btn-sm btn-primary"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteAward(award.id)}
                      disabled={loading}
                      className="btn btn-sm btn-secondary"
                      title="Delete award"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default AwardsManagement
