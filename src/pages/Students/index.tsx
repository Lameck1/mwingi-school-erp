import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Eye, Edit, FileText, ChevronLeft, ChevronRight } from 'lucide-react'

export default function Students() {
    const navigate = useNavigate()
    const [students, setStudents] = useState<any[]>([])
    const [streams, setStreams] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({ streamId: '', isActive: true })
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 15

    useEffect(() => {
        loadData()
    }, [])

    useEffect(() => {
        loadStudents()
    }, [filters])

    const loadData = async () => {
        try {
            const [streamsData] = await Promise.all([
                window.electronAPI.getStreams()
            ])
            setStreams(streamsData)
            await loadStudents()
        } catch (error) {
            console.error('Failed to load data:', error)
        }
    }

    const loadStudents = async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getStudents({
                ...filters,
                search: search || undefined
            })
            setStudents(data)
        } catch (error) {
            console.error('Failed to load students:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        loadStudents()
    }

    const filteredStudents = students.filter(s =>
        !search ||
        s.admission_number.toLowerCase().includes(search.toLowerCase()) ||
        s.first_name.toLowerCase().includes(search.toLowerCase()) ||
        s.last_name.toLowerCase().includes(search.toLowerCase())
    )

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage)
    const paginatedStudents = filteredStudents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Students</h1>
                    <p className="text-gray-500 mt-1">Manage student records and enrollments</p>
                </div>
                <Link to="/students/new" className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span>Add Student</span>
                </Link>
            </div>

            {/* Filters */}
            <div className="card mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <form onSubmit={handleSearch} className="flex-1 min-w-[300px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name or admission number..."
                                aria-label="Search students"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="input pl-10"
                            />
                        </div>
                    </form>

                    <select
                        value={filters.streamId}
                        aria-label="Filter by class"
                        onChange={(e) => setFilters(prev => ({ ...prev, streamId: e.target.value }))}
                        className="input w-40"
                    >
                        <option value="">All Classes</option>
                        {streams.map(s => (
                            <option key={s.id} value={s.id}>{s.stream_name}</option>
                        ))}
                    </select>

                    <select
                        value={filters.isActive ? 'active' : 'inactive'}
                        aria-label="Filter by status"
                        onChange={(e) => setFilters(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                        className="input w-40"
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Admission No</th>
                                <th>Student Name</th>
                                <th>Grade</th>
                                <th>Type</th>
                                <th>Guardian Phone</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-500">Loading...</td>
                                </tr>
                            ) : paginatedStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-500">No students found</td>
                                </tr>
                            ) : (
                                paginatedStudents.map((student) => (
                                    <tr key={student.id}>
                                        <td className="font-medium">{student.admission_number}</td>
                                        <td>{student.first_name} {student.middle_name} {student.last_name}</td>
                                        <td>{student.stream_name || '-'}</td>
                                        <td>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.student_type === 'BOARDER'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {student.student_type === 'BOARDER' ? 'Boarder' : 'Day Scholar'}
                                            </span>
                                        </td>
                                        <td>{student.guardian_phone || '-'}</td>
                                        <td className="font-medium text-orange-600">{formatCurrency(0)}</td>
                                        <td>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                {student.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => navigate(`/students/${student.id}`)}
                                                    className="p-1 text-gray-500 hover:text-blue-600"
                                                    title="View"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/students/${student.id}`)}
                                                    className="p-1 text-gray-500 hover:text-green-600"
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/finance/payments?student=${student.id}`)}
                                                    className="p-1 text-gray-500 hover:text-purple-600"
                                                    title="Fee Statement"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                        <p className="text-sm text-gray-500">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                                aria-label="Next page"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
