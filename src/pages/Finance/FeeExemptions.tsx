import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores'
import { FeeExemption, ExemptionStats } from '../../types/electron-api/ExemptionAPI'
import { AcademicYear, Term } from '../../types/electron-api/AcademicAPI'
import { Student } from '../../types/electron-api/StudentAPI'
import { FeeCategory } from '../../types/electron-api/FinanceAPI'

export default function FeeExemptions() {
    const { user } = useAuthStore()
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
                window.electronAPI.getExemptions({ status: statusFilter || undefined }),
                window.electronAPI.getAcademicYears(),
                window.electronAPI.getFeeCategories(),
                window.electronAPI.getStudents(),
                window.electronAPI.getExemptionStats()
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
                const termsRes = await window.electronAPI.getTermsByYear(currentYear.id)
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
        loadData()
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
        const exemptionsRes = await window.electronAPI.getExemptions({ status: statusFilter || undefined })
        setExemptions(exemptionsRes)
    }, [statusFilter])

    useEffect(() => {
        loadExemptions()
    }, [loadExemptions])

    const handleYearChange = async (yearId: number) => {
        setFormData(prev => ({ ...prev, academic_year_id: yearId, term_id: 0 }))
        const termsRes = await window.electronAPI.getTermsByYear(yearId)
        setTerms(termsRes)
    }

    const handleSelectStudent = (student: Student) => {
        setSelectedStudent(student)
        setFormData(prev => ({ ...prev, student_id: student.id }))
        setStudentSearch('')
        setFilteredStudents([])
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !formData.student_id || !formData.academic_year_id || !formData.exemption_percentage || !formData.exemption_reason) {
            alert('Please fill in all required fields')
            return
        }

        const result = await window.electronAPI.createExemption({
            student_id: formData.student_id,
            academic_year_id: formData.academic_year_id,
            term_id: formData.term_id || undefined,
            fee_category_id: formData.fee_category_id || undefined,
            exemption_percentage: parseFloat(formData.exemption_percentage),
            exemption_reason: formData.exemption_reason,
            notes: formData.notes || undefined
        }, user.id)

        if (result.success) {
            alert('Exemption created successfully!')
            setShowModal(false)
            setFormData({
                student_id: 0, academic_year_id: formData.academic_year_id, term_id: formData.term_id,
                fee_category_id: 0, exemption_percentage: '', exemption_reason: '', notes: ''
            })
            setSelectedStudent(null)
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const handleRevoke = async () => {
        if (!user || !selectedExemption || !revokeReason) {
            alert('Please provide a reason for revoking')
            return
        }

        const result = await window.electronAPI.revokeExemption(selectedExemption.id, revokeReason, user.id)
        if (result.success) {
            alert('Exemption revoked successfully')
            setShowRevokeModal(false)
            setSelectedExemption(null)
            setRevokeReason('')
            loadData()
        } else {
            alert(`Error: ${result.errors?.join(', ')}`)
        }
    }

    const getReasonBadgeColor = (reason: string) => {
        const lowerReason = reason.toLowerCase()
        if (lowerReason.includes('scholarship')) return 'bg-blue-100 text-blue-800'
        if (lowerReason.includes('staff')) return 'bg-purple-100 text-purple-800'
        if (lowerReason.includes('bursary')) return 'bg-green-100 text-green-800'
        if (lowerReason.includes('orphan')) return 'bg-orange-100 text-orange-800'
        return 'bg-gray-100 text-gray-800'
    }

    if (loading) {
        return <div className="p-6 text-center">Loading...</div>
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Fee Exemptions</h1>
                    <p className="text-gray-600">Manage student fee exemptions and scholarships</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Grant Exemption
                </button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                        <div className="text-sm text-gray-500">Total Exemptions</div>
                        <div className="text-2xl font-bold">{stats.totalExemptions}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                        <div className="text-sm text-gray-500">Active</div>
                        <div className="text-2xl font-bold">{stats.activeExemptions}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
                        <div className="text-sm text-gray-500">Full (100%)</div>
                        <div className="text-2xl font-bold">{stats.fullExemptions}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
                        <div className="text-sm text-gray-500">Partial</div>
                        <div className="text-2xl font-bold">{stats.partialExemptions}</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-4">
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                    aria-label="Filter by status"
                >
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="REVOKED">Revoked</option>
                </select>
            </div>

            {/* Exemptions Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year/Term</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exemption</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {exemptions.map(exemption => (
                            <tr key={exemption.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium">{exemption.student_name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.year_name} {exemption.term_name && `/ ${exemption.term_name}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.category_name || <span className="text-gray-400">All Categories</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-sm font-bold rounded ${exemption.exemption_percentage === 100
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
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
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                        }`}>
                                        {exemption.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {exemption.approved_by_name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {exemption.status === 'ACTIVE' && (
                                        <button
                                            onClick={() => { setSelectedExemption(exemption); setShowRevokeModal(true); }}
                                            className="text-red-600 hover:text-red-800"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {exemptions.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
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
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">Grant Fee Exemption</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            {/* Student Search */}
                            <div className="relative">
                                <label className="block text-sm font-medium mb-1">Student *</label>
                                {selectedStudent ? (
                                    <div className="flex items-center justify-between p-2 border rounded-lg bg-blue-50">
                                        <span>{selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.admission_number})</span>
                                        <button type="button" onClick={() => setSelectedStudent(null)} className="text-red-500">×</button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            value={studentSearch}
                                            onChange={(e) => setStudentSearch(e.target.value)}
                                            className="w-full border rounded-lg p-2"
                                            placeholder="Search by name or admission number..."
                                        />
                                        {filteredStudents.length > 0 && (
                                            <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                                                {filteredStudents.map(s => (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => handleSelectStudent(s)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                handleSelectStudent(s)
                                                            }
                                                        }}
                                                        tabIndex={0}
                                                        role="button"
                                                        className="p-2 hover:bg-gray-100 cursor-pointer"
                                                    >
                                                        {s.first_name} {s.last_name} ({s.admission_number})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Academic Year *</label>
                                    <select
                                        value={formData.academic_year_id}
                                        onChange={(e) => handleYearChange(parseInt(e.target.value))}
                                        className="w-full border rounded-lg p-2"
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
                                    <label className="block text-sm font-medium mb-1">Term (Optional)</label>
                                    <select
                                        value={formData.term_id}
                                        onChange={(e) => setFormData({ ...formData, term_id: parseInt(e.target.value) })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Term"
                                    >
                                        <option value="">All Terms</option>
                                        {terms.map(t => (
                                            <option key={t.id} value={t.id}>{t.term_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Fee Category (Optional)</label>
                                    <select
                                        value={formData.fee_category_id}
                                        onChange={(e) => setFormData({ ...formData, fee_category_id: parseInt(e.target.value) })}
                                        className="w-full border rounded-lg p-2"
                                        aria-label="Fee category"
                                    >
                                        <option value="">All Categories</option>
                                        {feeCategories.map(c => (
                                            <option key={c.id} value={c.id}>{c.category_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Exemption Percentage *</label>
                                    <input
                                        type="number"
                                        value={formData.exemption_percentage}
                                        onChange={(e) => setFormData({ ...formData, exemption_percentage: e.target.value })}
                                        className="w-full border rounded-lg p-2"
                                        placeholder="e.g., 50, 75, 100"
                                        min="1"
                                        max="100"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Reason *</label>
                                <select
                                    value={formData.exemption_reason}
                                    onChange={(e) => setFormData({ ...formData, exemption_reason: e.target.value })}
                                    className="w-full border rounded-lg p-2"
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
                                <label className="block text-sm font-medium mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full border rounded-lg p-2"
                                    rows={2}
                                    placeholder="Additional notes about this exemption..."
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setSelectedStudent(null); }}
                                    className="px-4 py-2 bg-gray-200 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4 text-red-600">Revoke Exemption</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Are you sure you want to revoke the {selectedExemption.exemption_percentage}% exemption for {selectedExemption.student_name}?
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Reason for Revocation *</label>
                            <textarea
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                                className="w-full border rounded-lg p-2"
                                rows={3}
                                placeholder="Please provide a reason..."
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setShowRevokeModal(false); setSelectedExemption(null); setRevokeReason(''); }}
                                className="px-4 py-2 bg-gray-200 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRevoke}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg"
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
