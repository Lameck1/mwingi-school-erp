import React from 'react'

import { type AcademicYear, type Term } from '../../../types/electron-api/AcademicAPI'
import { type FeeCategory } from '../../../types/electron-api/FinanceAPI'
import { type Student } from '../../../types/electron-api/StudentAPI'
import { type ExemptionFormData } from './useFeeExemptions'

interface GrantExemptionModalProps {
    showModal: boolean
    setShowModal: (show: boolean) => void
    formData: ExemptionFormData
    setFormData: (data: ExemptionFormData) => void
    academicYears: AcademicYear[]
    terms: Term[]
    feeCategories: FeeCategory[]
    selectedStudent: Student | null
    setSelectedStudent: (student: Student | null) => void
    studentSearch: string
    setStudentSearch: (search: string) => void
    filteredStudents: Student[]
    setFilteredStudents: (students: Student[]) => void
    handleCreate: (e: React.SyntheticEvent) => void
    handleYearChange: (yearId: number) => void
    handleSelectStudent: (student: Student) => void
}

export function GrantExemptionModal({ showModal, setShowModal, formData, setFormData, academicYears, terms, feeCategories, selectedStudent, setSelectedStudent, studentSearch, setStudentSearch, filteredStudents, setFilteredStudents, handleCreate, handleYearChange, handleSelectStudent }: Readonly<GrantExemptionModalProps>) {
    if (!showModal) { return null }
    return (
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
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedStudent(null)
                                        setFormData({ ...formData, student_id: 0 })
                                    }}
                                    className="text-red-500"
                                >
                                    ×
                                </button>
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
                            onClick={() => {
                                setShowModal(false)
                                setSelectedStudent(null)
                                setStudentSearch('')
                                setFilteredStudents([])
                                setFormData({ ...formData, student_id: 0 })
                            }}
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
    )
}
