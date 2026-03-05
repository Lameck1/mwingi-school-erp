import type React from 'react'
import { useState, useEffect, useCallback } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type AcademicYear, type Term } from '../../../types/electron-api/AcademicAPI'
import { type FeeExemption, type ExemptionStats } from '../../../types/electron-api/ExemptionAPI'
import { type FeeCategory } from '../../../types/electron-api/FinanceAPI'
import { type Student } from '../../../types/electron-api/StudentAPI'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

export type ExemptionFormData = {
    student_id: number
    academic_year_id: number
    term_id: number
    fee_category_id: number
    exemption_percentage: string
    exemption_reason: string
    notes: string
}

const INITIAL_FORM_DATA: ExemptionFormData = {
    student_id: 0,
    academic_year_id: 0,
    term_id: 0,
    fee_category_id: 0,
    exemption_percentage: '',
    exemption_reason: '',
    notes: ''
}

export function useFeeExemptions() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    // Data state
    const [exemptions, setExemptions] = useState<FeeExemption[]>([])
    const [stats, setStats] = useState<ExemptionStats | null>(null)
    const [students, setStudents] = useState<Student[]>([])
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [terms, setTerms] = useState<Term[]>([])
    const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [showModal, setShowModal] = useState(false)
    const [showRevokeModal, setShowRevokeModal] = useState(false)
    const [selectedExemption, setSelectedExemption] = useState<FeeExemption | null>(null)
    const [revokeReason, setRevokeReason] = useState('')

    // Student search state
    const [studentSearch, setStudentSearch] = useState('')
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([])

    // Filters
    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'REVOKED' | 'all'>('ACTIVE')

    // Form state
    const [formData, setFormData] = useState<ExemptionFormData>(INITIAL_FORM_DATA)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

    // ── Data loading ──────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [exemptionsRes, yearsRes, categoriesRes, studentsRes, statsRes] = await Promise.all([
                globalThis.electronAPI.finance.getExemptions({
                    ...(statusFilter === 'all' ? {} : { status: statusFilter })
                }),
                globalThis.electronAPI.academic.getAcademicYears(),
                globalThis.electronAPI.finance.getFeeCategories(),
                globalThis.electronAPI.students.getStudents({}),
                globalThis.electronAPI.finance.getExemptionStats()
            ])
            const exemptionsList = unwrapArrayResult(exemptionsRes, 'Failed to load exemptions')
            const years = unwrapArrayResult(yearsRes, 'Failed to load academic years')
            const categories = unwrapArrayResult(categoriesRes, 'Failed to load fee categories')
            const studentsResult = unwrapIPCResult<{ rows: Student[] }>(studentsRes, 'Failed to load students')
            const statsData = unwrapIPCResult<ExemptionStats>(statsRes, 'Failed to load exemption stats')

            setExemptions(exemptionsList)
            setAcademicYears(years)
            setFeeCategories(categories)
            setStudents(studentsResult.rows)
            setStats(statsData)

            // Set current year as default
            const currentYear = years.find((y: AcademicYear) => y.is_current)
            if (currentYear) {
                setFormData(prev => ({ ...prev, academic_year_id: currentYear.id }))
                const termsRes = await globalThis.electronAPI.academic.getTermsByYear(currentYear.id)
                const termsList = unwrapArrayResult(termsRes, 'Failed to load terms for current year')
                setTerms(termsList)
                const currentTerm = termsList.find((t: Term) => t.is_current)
                if (currentTerm) {
                    setFormData(prev => ({ ...prev, term_id: currentTerm.id }))
                }
            }
        } catch (error) {
            console.error('Failed to load exemption data:', error)
            setExemptions([])
            setAcademicYears([])
            setTerms([])
            setFeeCategories([])
            setStudents([])
            setStats(null)
            showToast(error instanceof Error ? error.message : 'Failed to load exemption data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast, statusFilter])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load exemption data', err))
    }, [loadData])

    // ── Student search filter ─────────────────────────────────

    useEffect(() => {
        if (studentSearch.length >= 2) {
            const filtered = students.filter(s =>
                `${s.first_name} ${s.last_name}`.toLowerCase().includes(studentSearch.toLowerCase()) ||
                s.admission_number.toLowerCase().includes(studentSearch.toLowerCase())
            )
            setFilteredStudents(filtered.slice(0, 10))
        } else {
            setFilteredStudents([])
        }
    }, [studentSearch, students])

    // ── Exemptions reload on filter change ────────────────────

    const loadExemptions = useCallback(async () => {
        try {
            const exemptionsRes = await globalThis.electronAPI.finance.getExemptions({
                ...(statusFilter === 'all' ? {} : { status: statusFilter })
            })
            setExemptions(unwrapArrayResult(exemptionsRes, 'Failed to load exemptions'))
        } catch (error) {
            console.error('Failed to load exemptions:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load exemptions', 'error')
            setExemptions([])
        }
    }, [showToast, statusFilter])

    useEffect(() => {
        loadExemptions().catch((err: unknown) => console.error('Failed to load exemptions', err))
    }, [loadExemptions])

    // ── Handlers ──────────────────────────────────────────────

    const handleYearChange = async (yearId: number) => {
        setFormData(prev => ({ ...prev, academic_year_id: yearId, term_id: 0 }))
        try {
            const termsRes = await globalThis.electronAPI.academic.getTermsByYear(yearId)
            setTerms(unwrapArrayResult(termsRes, 'Failed to load terms for selected year'))
        } catch (error) {
            console.error('Failed to load terms:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load terms for selected year', 'error')
            setTerms([])
        }
    }

    const handleSelectStudent = (student: Student) => {
        setSelectedStudent(student)
        setFormData(prev => ({ ...prev, student_id: student.id }))
        setStudentSearch('')
        setFilteredStudents([])
    }

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!user?.id || !formData.student_id || !formData.academic_year_id || !formData.exemption_percentage || !formData.exemption_reason) {
            showToast('Please fill in all required fields', 'warning')
            return
        }

        try {
            const result = await globalThis.electronAPI.finance.createExemption({
                student_id: formData.student_id,
                academic_year_id: formData.academic_year_id,
                term_id: formData.term_id || undefined,
                fee_category_id: formData.fee_category_id || undefined,
                exemption_percentage: Number.parseFloat(formData.exemption_percentage),
                exemption_reason: formData.exemption_reason,
                notes: formData.notes || undefined
            } as Parameters<typeof globalThis.electronAPI.finance.createExemption>[0], user.id)

            if (result.success) {
                showToast('Exemption created successfully', 'success')
                setShowModal(false)
                setFormData(prev => ({
                    ...INITIAL_FORM_DATA,
                    academic_year_id: prev.academic_year_id,
                    term_id: prev.term_id,
                }))
                setSelectedStudent(null)
                loadData().catch((err: unknown) => console.error('Failed to reload data', err))
            } else {
                showToast(`Error: ${result.errors?.join(', ') || 'Unknown error'}`, 'error')
            }
        } catch (error) {
            console.error('Failed to create exemption:', error)
            showToast(error instanceof Error ? error.message : 'Failed to create exemption', 'error')
        }
    }

    const handleRevoke = async () => {
        if (!user?.id || !selectedExemption || !revokeReason) {
            showToast('Please provide a reason for revoking', 'warning')
            return
        }

        try {
            const result = await globalThis.electronAPI.finance.revokeExemption(selectedExemption.id, revokeReason, user.id)
            if (result.success) {
                showToast('Exemption revoked successfully', 'success')
                setShowRevokeModal(false)
                setSelectedExemption(null)
                setRevokeReason('')
                loadData().catch((err: unknown) => console.error('Failed to reload data', err))
            } else {
                showToast(`Error: ${result.errors?.join(', ') || 'Unknown error'}`, 'error')
            }
        } catch (error) {
            console.error('Failed to revoke exemption:', error)
            showToast(error instanceof Error ? error.message : 'Failed to revoke exemption', 'error')
        }
    }

    return {
        // Data
        exemptions,
        stats,
        academicYears,
        terms,
        feeCategories,
        loading,

        // Filter
        statusFilter,
        setStatusFilter,

        // Grant modal
        showModal,
        setShowModal,
        formData,
        setFormData,
        selectedStudent,
        setSelectedStudent,
        studentSearch,
        setStudentSearch,
        filteredStudents,
        setFilteredStudents,
        handleYearChange,
        handleSelectStudent,
        handleCreate,

        // Revoke modal
        showRevokeModal,
        setShowRevokeModal,
        selectedExemption,
        setSelectedExemption,
        revokeReason,
        setRevokeReason,
        handleRevoke,
    }
}
