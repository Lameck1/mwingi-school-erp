import React, { useState, useEffect, useCallback } from 'react'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { type AcademicYear, type Term } from '../../types/electron-api/AcademicAPI'
import { type FeeExemption, type ExemptionStats } from '../../types/electron-api/ExemptionAPI'
import { type FeeCategory } from '../../types/electron-api/FinanceAPI'
import { type Student } from '../../types/electron-api/StudentAPI'


const getReasonBadgeColor = (reason: string): string => {
    const lowerReason = reason.toLowerCase()
    if (lowerReason.includes('scholarship')) {
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    }
    if (lowerReason.includes('staff')) {
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
    }
    if (lowerReason.includes('bursary')) {
        return 'bg-green-500/15 text-green-600 dark:text-green-400'
    }
    if (lowerReason.includes('orphan')) {
        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
    }
    return 'bg-secondary text-foreground'
}

export default function FeeExemptions() {
    const { user } = useAuthStore()
    const { showToast } = useToast()
    const [exemptions, setExemptions] = useState<FeeExemption[]>([])
    const [stats, setStats] = useState<ExemptionStats | null>(null)
    const [students, setStudents] = useState<Student[]>([])
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [terms, setTerms] = useState<Term[]>([])
    const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showRevokeModal, setShowRevokeModal] = useState(false)
    const [selectedExemption, setSelectedExemption] = useState<FeeExemption | null>(null)
    const [revokeReason, setRevokeReason] = useState('')
    const [studentSearch, setStudentSearch] = useState('')
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([])

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')

    // Form state
    const [formData, setFormData] = useState({
        student_id: 0,
        academic_year_id: 0,
        term_id: 0,
        fee_category_id: 0,
        exemption_percentage: '',
        exemption_reason: '',
        notes: ''
    })

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [exemptionsRes, yearsRes, categoriesRes, studentsRes, statsRes] = await Promise.all([
                globalThis.electronAPI.getExemptions({ status: statusFilter || undefined }),
                globalThis.electronAPI.getAcademicYears(),
                globalThis.electronAPI.getFeeCategories(),
                globalThis.electronAPI.getStudents(),
                globalThis.electronAPI.getExemptionStats()
            ])
            setExemptions(exemptionsRes)
            setAcademicYears(yearsRes)
            setFeeCategories(categoriesRes)
            setStudents(studentsRes)
            setStats(statsRes)

            // Set current year as default
            const currentYear = yearsRes.find((y: AcademicYear) => y.is_current)
            if (currentYear) {
                setFormData(prev => ({ ...prev, academic_year_id: currentYear.id }))
                const termsRes = await globalThis.electronAPI.getTermsByYear(currentYear.id)
                setTerms(termsRes)
                const currentTerm = termsRes.find((t: Term) => t.is_current)
                if (currentTerm) {
                    setFormData(prev => ({ ...prev, term_id: currentTerm.id }))
                }
            }
        } catch (error) {
            console.error('Failed to load exemption data:', error)
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load exemption data', err))
    }, [loadData])

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



    const loadExemptions = useCallback(async () => {
        const exemptionsRes = await globalThis.electronAPI.getExemptions({ status: statusFilter || undefined })
        setExemptions(exemptionsRes)
    }, [statusFilter])

    useEffect(() => {
        loadExemptions().catch((err: unknown) => console.error('Failed to load exemptions', err))
    }, [loadExemptions])

    const handleYearChange = async (yearId: number) => {
        setFormData(prev => ({ ...prev, academic_year_id: yearId, term_id: 0 }))
        const termsRes = await globalThis.electronAPI.getTermsByYear(yearId)
        setTerms(termsRes)
    }

    const handleSelectStudent = (student: Student) => {
        setSelectedStudent(student)
        setFormData(prev => ({ ...prev, student_id: student.id }))
        setStudentSearch('')
        setFilteredStudents([])
    }

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!user || !formData.student_id || !formData.academic_year_id || !formData.exemption_percentage || !formData.exemption_reason) {
            showToast('Please fill in all required fields', 'warning')
            return
        }

        try {
            const result = await globalThis.electronAPI.createExemption({
                student_id: formData.student_id,
                academic_year_id: formData.academic_year_id,
                term_id: formData.term_id || undefined,
                fee_category_id: formData.fee_category_id || undefined,
                exemption_percentage: Number.parseFloat(formData.exemption_percentage),
                exemption_reason: formData.exemption_reason,
                notes: formData.notes || undefined
            }, user.id)

            if (result.success) {
                showToast('Exemption created successfully', 'success')
                setShowModal(false)
                setFormData({
                    student_id: 0, academic_year_id: formData.academic_year_id, term_id: formData.term_id,
                    fee_category_id: 0, exemption_percentage: '', exemption_reason: '', notes: ''
                })
                setSelectedStudent(null)
                loadData().catch((err: unknown) => console.error('Failed to reload data', err))
            } else {
                showToast(`Error: ${result.errors?.join(', ') || 'Unknown error'}`, 'error')
            }
        } catch (error) {
            console.error('Failed to create exemption:', error)
            showToast('Failed to create exemption', 'error')
        }
    }

    const handleRevoke = async () => {
        if (!user || !selectedExemption || !revokeReason) {
            showToast('Please provide a reason for revoking', 'warning')
            return
        }

        try {
            const result = await globalThis.electronAPI.revokeExemption(selectedExemption.id, revokeReason, user.id)
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
            showToast('Failed to revoke exemption', 'error')
        }
    }

    if (loading) {
        return <div className="p-6 text-center">Loading...</div>
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Fee Exemptions' }]} />
                    <h1 className="text-2xl font-bold text-foreground">Fee Exemptions</h1>
                    <p className="text-muted-foreground">Manage student fee exemptions and scholarships</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80"
                >
                    + Grant Exemption
                </button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-blue-500">
                        <div className="text-sm text-muted-foreground">Total Exemptions</div>
                        <div className="text-2xl font-bold">{stats.totalExemptions}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-green-500">
                        <div className="text-sm text-muted-foreground">Active</div>
                        <div className="text-2xl font-bold">{stats.activeExemptions}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-purple-500">
                        <div className="text-sm text-muted-foreground">Full (100%)</div>
                        <div className="text-2xl font-bold">{stats.fullExemptions}</div>
                    </div>
                    <div className="bg-card p-4 rounded-lg shadow border-l-4 border-orange-500">
                        <div className="text-sm text-muted-foreground">Partial</div>
                        <div className="text-2xl font-bold">{stats.partialExemptions}</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-4">
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-border rounded-lg bg-input text-foreground"
                    aria-label="Filter by status"
                >
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="REVOKED">Revoked</option>
                </select>
            </div>

            {/* Exemptions Table */}
            <div className="bg-card rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-secondary">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Student</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Year/Term</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Exemption</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase max-w-[120px]">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Approved By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                        {exemptions.map(exemption => (
                            <tr key={exemption.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium">{exemption.student_name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.year_name} {exemption.term_name && `/ ${exemption.term_name}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.category_name || <span className="text-muted-foreground">All Categories</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-sm font-bold rounded ${exemption.exemption_percentage === 100
                                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                        : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                        }`}>
                                        {exemption.exemption_percentage}%
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs rounded-full ${getReasonBadgeColor(exemption.exemption_reason)}`}>
                                        {exemption.exemption_reason}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs rounded-full ${exemption.status === 'ACTIVE'
                                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                        : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                        }`}>
                                        {exemption.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                    {exemption.approved_by_name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.status === 'ACTIVE' && (
                                        <button
                                            onClick={() => { setSelectedExemption(exemption); setShowRevokeModal(true); }}
                                            className="text-destructive hover:text-destructive/80"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {exemptions.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                                    No exemptions found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Grant Exemption Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">Grant Fee Exemption</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            {/* Student Search */}
                            <div className="relative">
                                <label htmlFor="field-311" className="block text-sm font-medium mb-1">Student *</label>
                                {selectedStudent ? (
                                    <div className="flex items-center justify-between p-2 border border-border rounded-lg bg-primary/10">
                                        <span>{selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.admission_number})</span>
                                        <button type="button" onClick={() => setSelectedStudent(null)} className="text-red-500">×</button>
                                    </div>
                                ) : (
                                    <>
                                        <input id="field-311"
                                            type="text"
                                            value={studentSearch}
                                            onChange={(e) => setStudentSearch(e.target.value)}
                                            className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                            placeholder="Search by name or admission number..."
                                        />
                                        {filteredStudents.length > 0 && (
                                            <div className="absolute z-10 w-full bg-card border rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                                                {filteredStudents.map(s => (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => handleSelectStudent(s)}
                                                        className="w-full text-left p-2 hover:bg-secondary"
                                                    >
                                                        {s.first_name} {s.last_name} ({s.admission_number})
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-352" className="block text-sm font-medium mb-1">Academic Year *</label>
                                    <select id="field-352"
                                        value={formData.academic_year_id}
                                        onChange={(e) => handleYearChange(Number.parseInt(e.target.value, 10))}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        required
                                        aria-label="Academic year"
                                    >
                                        <option value="">Select Year</option>
                                        {academicYears.map(y => (
                                            <option key={y.id} value={y.id}>{y.year_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="field-367" className="block text-sm font-medium mb-1">Term (Optional)</label>
                                    <select id="field-367"
                                        value={formData.term_id}
                                        onChange={(e) => setFormData({ ...formData, term_id: Number.parseInt(e.target.value, 10) })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Term"
                                    >
                                        <option value="">All Terms</option>
                                        {terms.map(t => (
                                            <option key={t.id} value={t.id}>{t.term_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-384" className="block text-sm font-medium mb-1">Fee Category (Optional)</label>
                                    <select id="field-384"
                                        value={formData.fee_category_id}
                                        onChange={(e) => setFormData({ ...formData, fee_category_id: Number.parseInt(e.target.value, 10) })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        aria-label="Fee category"
                                    >
                                        <option value="">All Categories</option>
                                        {feeCategories.map(c => (
                                            <option key={c.id} value={c.id}>{c.category_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="field-398" className="block text-sm font-medium mb-1">Exemption Percentage *</label>
                                    <input id="field-398"
                                        type="number"
                                        value={formData.exemption_percentage}
                                        onChange={(e) => setFormData({ ...formData, exemption_percentage: e.target.value })}
                                        className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                        placeholder="e.g., 50, 75, 100"
                                        min="1"
                                        max="100"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="field-413" className="block text-sm font-medium mb-1">Reason *</label>
                                <select id="field-413"
                                    value={formData.exemption_reason}
                                    onChange={(e) => setFormData({ ...formData, exemption_reason: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    required
                                    aria-label="Exemption reason"
                                >
                                    <option value="">Select Reason</option>
                                    <option value="Scholarship">Scholarship</option>
                                    <option value="Bursary">Bursary</option>
                                    <option value="Staff Child">Staff Child</option>
                                    <option value="Orphan Support">Orphan Support</option>
                                    <option value="Board Decision">Board Decision</option>
                                    <option value="Special Case">Special Case</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="field-432" className="block text-sm font-medium mb-1">Notes</label>
                                <textarea id="field-432"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                    rows={2}
                                    placeholder="Additional notes about this exemption..."
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setSelectedStudent(null); }}
                                    className="px-4 py-2 bg-secondary rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                                >
                                    Grant Exemption
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Revoke Modal */}
            {showRevokeModal && selectedExemption && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4 text-red-600">Revoke Exemption</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            Are you sure you want to revoke the {selectedExemption.exemption_percentage}% exemption for {selectedExemption.student_name}?
                        </p>
                        <div className="mb-4">
                            <label htmlFor="field-471" className="block text-sm font-medium mb-1">Reason for Revocation *</label>
                            <textarea id="field-471"
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                                className="w-full border border-border rounded-lg p-2 bg-input text-foreground"
                                rows={3}
                                placeholder="Please provide a reason..."
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setShowRevokeModal(false); setSelectedExemption(null); setRevokeReason(''); }}
                                className="px-4 py-2 bg-secondary rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRevoke}
                                className="px-4 py-2 bg-destructive text-white rounded-lg"
                            >
                                Revoke Exemption
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
