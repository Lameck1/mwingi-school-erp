import { useState, useEffect, useCallback } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAppStore, useAuthStore } from '../../../stores'
import type { Student } from '../../../types/electron-api/StudentAPI'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

import { APPROVER_ROLES, isStudentAward, mapStudentToOption } from './AwardsManagement.types'
import type { StudentAward, AwardCategory, StudentOption } from './AwardsManagement.types'

export function useAwardsManagement() {
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)
    const currentTerm = useAppStore((s) => s.currentTerm)
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    const [awards, setAwards] = useState<StudentAward[]>([])
    const [categories, setCategories] = useState<AwardCategory[]>([])
    const [students, setStudents] = useState<StudentOption[]>([])

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

    // Derived
    const canApprove = user?.role ? APPROVER_ROLES.has(user.role) : false

    // ── Data loading ──────────────────────────────────────────

    const loadAwards = useCallback(async () => {
        try {
            const status = filterStatus === 'all' ? undefined : filterStatus
            const awardData = await globalThis.electronAPI.academic.getAwards({
                academicYearId: (currentAcademicYear?.id as number) || undefined,
                termId: (currentTerm?.id as number) || undefined,
                status
            })
            const parsedAwards = unwrapArrayResult(awardData, 'Failed to load awards')
            setAwards(parsedAwards.filter((award): award is StudentAward => isStudentAward(award)))
        } catch (error) {
            console.error('Failed to load awards:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load awards', 'error')
            setAwards([])
        }
    }, [currentAcademicYear, currentTerm, filterStatus, showToast])

    const loadInitialData = useCallback(async () => {
        try {
            const [categoryData, studentData] = await Promise.all([
                globalThis.electronAPI.academic.getAwardCategories(),
                globalThis.electronAPI.students.getStudents({})
            ])

            const categoriesData = unwrapArrayResult(categoryData, 'Failed to load award categories')
            const studentsResult = unwrapIPCResult<{ rows: Student[] }>(studentData, 'Failed to load students')

            setCategories(categoriesData)
            setStudents(studentsResult.rows.map((s) => mapStudentToOption(s)))
        } catch (error) {
            console.error('Failed to load initial data:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load award setup data', 'error')
            setCategories([])
            setStudents([])
        }
    }, [showToast])

    useEffect(() => {
        loadInitialData().catch((err: unknown) => console.error('Failed to load initial data:', err))
    }, [loadInitialData])

    useEffect(() => {
        loadAwards().catch((err: unknown) => console.error('Failed to load awards:', err))
    }, [loadAwards])

    // ── Handlers ──────────────────────────────────────────────

    const handleAwardStudent = async () => {
        if (selectedStudent === 0 || selectedCategory === 0) {
            showToast('Please select a student and award category', 'warning')
            return
        }
        if (!currentAcademicYear?.id) {
            showToast('Select an active academic year before assigning awards', 'warning')
            return
        }
        if (!user?.id) {
            showToast('User session not found. Please log in again.', 'error')
            return
        }

        setLoading(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.awardStudent({
                    studentId: selectedStudent,
                    categoryId: selectedCategory,
                    academicYearId: currentAcademicYear.id,
                    termId: (currentTerm?.id as number) || undefined,
                    userId: user.id,
                    userRole: (user?.role as string) || undefined,
                    remarks: undefined
                }),
                'Failed to assign award'
            )

            await loadAwards()
            setSelectedStudent(0)
            setSelectedCategory(0)
            setShowForm(false)
            showToast('Award assigned successfully!', 'success')
        } catch (error) {
            console.error('Failed to assign award:', error)
            showToast(error instanceof Error ? error.message : 'Failed to assign award', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleApproveAward = async (awardId: number) => {
        if (!user?.id) {
            showToast('User session not found. Please log in again.', 'error')
            return
        }
        setLoading(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.approveAward({
                    awardId,
                    userId: user.id
                }),
                'Failed to approve award'
            )
            await loadAwards()
            showToast('Award approved successfully!', 'success')
        } catch (error) {
            console.error('Failed to approve award:', error)
            showToast(error instanceof Error ? error.message : 'Failed to approve award', 'error')
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
            showToast('Please enter a reason for rejection', 'warning')
            return
        }
        if (!user?.id) {
            showToast('User session not found. Please log in again.', 'error')
            return
        }
        if (!rejectingAwardId) {
            showToast('No award selected for rejection', 'warning')
            return
        }

        setLoading(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.rejectAward({
                    awardId: rejectingAwardId,
                    userId: user.id,
                    reason: rejectionReason
                }),
                'Failed to reject award'
            )
            await loadAwards()
            setShowRejectModal(false)
            setRejectingAwardId(null)
            setRejectionReason('')
            showToast('Award rejected', 'success')
        } catch (error) {
            console.error('Failed to reject award:', error)
            showToast(error instanceof Error ? error.message : 'Failed to reject award', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteAward = async (awardId: number) => {
        setLoading(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.deleteAward({ awardId }),
                'Failed to delete award'
            )
            setAwards(awards.filter(a => a.id !== awardId))
            showToast('Award deleted successfully!', 'success')
        } catch (error) {
            console.error('Failed to delete award:', error)
            showToast(error instanceof Error ? error.message : 'Failed to delete award', 'error')
        } finally {
            setLoading(false)
        }
    }

    // ── Derived data ──────────────────────────────────────────

    const filteredAwards = awards.filter(
        (award) => filterCategory === 0 || award.award_category_id === filterCategory
    )

    const categoryMap = new Map(categories.map(c => [c.id, c]))

    return {
        // Data
        awards,
        categories,
        students,
        filteredAwards,
        categoryMap,
        loading,
        canApprove,

        // Form state
        showForm,
        setShowForm,
        selectedStudent,
        setSelectedStudent,
        selectedCategory,
        setSelectedCategory,

        // Filters
        filterStatus,
        setFilterStatus,
        filterCategory,
        setFilterCategory,

        // Reject modal
        showRejectModal,
        setShowRejectModal,
        rejectionReason,
        setRejectionReason,

        // Handlers
        handleAwardStudent,
        handleApproveAward,
        openRejectModal,
        handleRejectAward,
        handleDeleteAward,
    }
}
