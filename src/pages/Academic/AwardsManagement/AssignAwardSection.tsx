import { Plus } from 'lucide-react'

import { Select } from '../../../components/ui/Select'

import type { AwardCategory, StudentOption } from './AwardsManagement.types'

interface AssignAwardSectionProps {
    showForm: boolean
    setShowForm: (show: boolean) => void
    selectedStudent: number
    setSelectedStudent: (val: number) => void
    selectedCategory: number
    setSelectedCategory: (val: number) => void
    students: StudentOption[]
    categories: AwardCategory[]
    loading: boolean
    handleAwardStudent: () => Promise<void>
}

export function AssignAwardSection({ showForm, setShowForm, selectedStudent, setSelectedStudent, selectedCategory, setSelectedCategory, students, categories, loading, handleAwardStudent }: Readonly<AssignAwardSectionProps>) {
    return (
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 rounded-lg bg-secondary/50 mb-6">
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
    )
}
