
import { Plus, Trash2, CheckCircle, Clock, XCircle, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { Select } from '../../components/ui/Select'
import { useAppStore, useAuthStore } from '../../stores'

// Roles that can approve awards
const APPROVER_ROLES = new Set(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL'])

interface StudentAward {
  id: number
  student_id: number
  student_name?: string
  admission_number: string
  first_name?: string
  last_name?: string
  award_category_id: number
  category_name: string
  awarded_date: string
  approval_status: 'pending' | 'approved' | 'rejected'
  assigned_by_name?: string
  approved_by_name?: string
  approved_at?: string
  rejection_reason?: string
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
  const { currentAcademicYear, currentTerm } = useAppStore()
  const { user } = useAuthStore()

  const [awards, setAwards] = useState<StudentAward[]>([])
  const [categories, setCategories] = useState<AwardCategory[]>([])
  const [students, setStudents] = useState<{ id: number; name: string; admission_number: string }[]>([])

  const [selectedStudent, setSelectedStudent] = useState<number>(0)
  const [selectedCategory, setSelectedCategory] = useState<number>(0)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<number>(0)

  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingAwardId, setRejectingAwardId] = useState<number | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Check if current user can approve
  const canApprove = user?.role ? APPROVER_ROLES.has(user.role) : false

  const loadAwards = useCallback(async () => {
    try {
      const status = filterStatus === 'all' ? undefined : filterStatus
      const awardData = await globalThis.electronAPI.getAwards({
        academicYearId: currentAcademicYear?.id,
        termId: currentTerm?.id,
        status
      })
      setAwards(awardData || [])
    } catch (error) {
      console.error('Failed to load awards:', error)
    }
  }, [currentAcademicYear, currentTerm, filterStatus])

  const loadInitialData = useCallback(async () => {
    try {
      const [categoryData, studentData] = await Promise.all([
        globalThis.electronAPI.getAwardCategories(),
        globalThis.electronAPI.getStudents({ stream_id: undefined })
      ])

      setCategories(categoryData || [])
      setStudents(studentData.map(s => ({
        id: s.id,
        name: s.full_name || `${s.first_name} ${s.last_name}`,
        admission_number: s.admission_number
      })) || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }, [])

  useEffect(() => {
    loadInitialData().catch((err: unknown) => console.error('Failed to load initial data:', err))
  }, [loadInitialData])

  useEffect(() => {
    loadAwards().catch((err: unknown) => console.error('Failed to load awards:', err))
  }, [loadAwards])

  const handleAwardStudent = async () => {
    if (selectedStudent === 0 || selectedCategory === 0) {
      alert('Please select a student and award category')
      return
    }

    setLoading(true)
    try {
      await globalThis.electronAPI.awardStudent({
        studentId: selectedStudent,
        categoryId: selectedCategory,
        academicYearId: currentAcademicYear!.id,
        termId: currentTerm?.id,
        userId: user?.id,
        userRole: user?.role || '',
        remarks: ''
      })

      await loadAwards()
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
      await globalThis.electronAPI.approveAward({
        awardId,
        userId: user?.id
      })
      await loadAwards()
      alert('Award approved successfully!')
    } catch (error) {
      console.error('Failed to approve award:', error)
      alert('Failed to approve award')
    } finally {
      setLoading(false)
    }
  }

  const openRejectModal = (awardId: number) => {
    setRejectingAwardId(awardId)
    setRejectionReason('')
    setShowRejectModal(true)
  }

  const handleRejectAward = async () => {
    if (!rejectionReason.trim()) {
      alert('Please enter a reason for rejection')
      return
    }

    setLoading(true)
    try {
      await globalThis.electronAPI.rejectAward({
        awardId: rejectingAwardId!,
        userId: user?.id,
        reason: rejectionReason
      })
      await loadAwards()
      setShowRejectModal(false)
      setRejectingAwardId(null)
      setRejectionReason('')
      alert('Award rejected')
    } catch (error) {
      console.error('Failed to reject award:', error)
      alert('Failed to reject award')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAward = async (awardId: number) => {
    if (!confirm('Are you sure you want to delete this award?')) {return}

    setLoading(true)
    try {
      await globalThis.electronAPI.deleteAward({ awardId })
      setAwards(awards.filter(a => a.id !== awardId))
      alert('Award deleted successfully!')
    } catch (error) {
      console.error('Failed to delete award:', error)
      alert('Failed to delete award')
    } finally {
      setLoading(false)
    }
  }

  const filteredAwards = awards.filter(
    (award) => filterCategory === 0 || award.award_category_id === filterCategory
  )

  const categoryMap = new Map(categories.map(c => [c.id, c]))

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-1 text-amber-400">
            <Clock size={16} />
            <span className="text-xs font-semibold">Pending</span>
          </div>
        )
      case 'approved':
        return (
          <div className="flex items-center gap-1 text-green-400">
            <CheckCircle size={16} />
            <span className="text-xs font-semibold">Approved</span>
          </div>
        )
      case 'rejected':
        return (
          <div className="flex items-center gap-1 text-red-400">
            <XCircle size={16} />
            <span className="text-xs font-semibold">Rejected</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Awards Management"
        subtitle="Manage student awards and recognitions"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Awards' }]}
      />

      {/* Award Categories */}
      <div className="premium-card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Award Categories</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.slice(0, 8).map(cat => (
            <div key={cat.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="font-semibold text-sm">{cat.name}</p>
              <p className="text-xs text-foreground/60 mt-1">{cat.category_type.replaceAll('_', ' ')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Assign Award */}
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

      {/* Awards List */}
      <div className="premium-card">
        <div className="flex gap-4 mb-6">
          <Select
            label="Status"
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as string)}
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
                className={`flex items-center justify-between p-4 rounded-lg border transition ${award.approval_status === 'rejected'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold">
                      {award.student_name || `${award.first_name} ${award.last_name}`}
                    </h4>
                    <span className="text-xs px-2 py-1 rounded bg-white/10 text-foreground/60">
                      {award.admission_number}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/60 mb-2">
                    {categoryMap.get(award.award_category_id)?.name || award.category_name}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-foreground/50">
                    <span>Awarded: {award.awarded_date ? new Date(award.awarded_date).toLocaleDateString() : 'N/A'}</span>
                    {award.assigned_by_name && <span>Assigned by: {award.assigned_by_name}</span>}
                    {award.approved_by_name && award.approval_status === 'approved' && (
                      <span className="text-green-400">Approved by: {award.approved_by_name}</span>
                    )}
                    {award.approved_by_name && award.approval_status === 'rejected' && (
                      <span className="text-red-400">Rejected by: {award.approved_by_name}</span>
                    )}
                  </div>
                  {award.rejection_reason && (
                    <p className="text-xs text-red-400 mt-2">Reason: {award.rejection_reason}</p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {getStatusBadge(award.approval_status)}
                  </div>

                  <div className="flex gap-2">
                    {award.approval_status === 'pending' && canApprove && (
                      <>
                        <button
                          onClick={() => handleApproveAward(award.id)}
                          disabled={loading}
                          className="btn btn-sm btn-primary"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openRejectModal(award.id)}
                          disabled={loading}
                          className="btn btn-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        >
                          Reject
                        </button>
                      </>
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

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-white/10 rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Reject Award</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-foreground/50 hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-foreground/60 mb-4">
              Please provide a reason for rejecting this award.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm resize-none focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectAward}
                disabled={loading || !rejectionReason.trim()}
                className="btn bg-red-500 text-white hover:bg-red-600"
              >
                {loading ? 'Rejecting...' : 'Reject Award'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AwardsManagement
