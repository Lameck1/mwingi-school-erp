import { useEffect, useState } from 'react'
import { Plus, UserCog, Edit, Trash2 } from 'lucide-react'

export default function Staff() {
    const [staff, setStaff] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [_showModal, setShowModal] = useState(false)

    useEffect(() => { loadStaff() }, [])

    const loadStaff = async () => {
        try {
            const data = await window.electronAPI.getStaff()
            setStaff(data)
        } catch (error) {
            console.error('Failed to load staff:', error)
        } finally { setLoading(false) }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
                    <p className="text-gray-500 mt-1">Manage teaching and non-teaching staff</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span>Add Staff</span>
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : staff.length === 0 ? (
                    <div className="text-center py-12">
                        <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Staff Records</h3>
                        <p className="text-gray-500 mb-4">Add staff members to manage their salaries</p>
                        <button onClick={() => setShowModal(true)} className="btn btn-primary">Add Staff Member</button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Staff No</th>
                                <th>Name</th>
                                <th>Department</th>
                                <th>Job Title</th>
                                <th>Phone</th>
                                <th>Basic Salary</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.map((s) => (
                                <tr key={s.id}>
                                    <td className="font-medium">{s.staff_number}</td>
                                    <td>{s.first_name} {s.middle_name} {s.last_name}</td>
                                    <td>{s.department || '-'}</td>
                                    <td>{s.job_title || '-'}</td>
                                    <td>{s.phone || '-'}</td>
                                    <td>{formatCurrency(s.basic_salary || 0)}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                            }`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <button className="p-1 text-gray-500 hover:text-blue-600" aria-label="Edit staff"><Edit className="w-4 h-4" /></button>
                                            <button className="p-1 text-gray-500 hover:text-red-600" aria-label="Delete staff"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
