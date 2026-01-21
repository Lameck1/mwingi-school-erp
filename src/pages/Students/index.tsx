import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Eye, Edit, FileText, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, User, CreditCard } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

export default function Students() {
    const navigate = useNavigate()
    const { showToast } = useToast()
    const [students, setStudents] = useState<any[]>([])
    const [streams, setStreams] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({ streamId: '', isActive: true })
    const [currentPage, setCurrentPage] = useState(1)
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
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
            showToast('Failed to load data', 'error')
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
            showToast('Failed to load students', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        loadStudents()
    }

    // Backend handles filtering, but we keep this if needed for client-side refinement
    // In this case, since backend returns filtered list, this just passes it through if search matches backend query
    const filteredStudents = students

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
                <div className="flex items-center gap-4">
                     <div className="flex bg-gray-100 rounded-lg p-1">
                        <button 
                            onClick={() => setViewMode('list')} 
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            title="List View"
                        >
                            <ListIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => setViewMode('grid')} 
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                    </div>
                    <Link to="/students/new" className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        <span>Add Student</span>
                    </Link>
                </div>
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
                                className="input pl-10 w-full"
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

            {/* Content */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading students...</p>
                </div>
            ) : paginatedStudents.length === 0 ? (
                <div className="card text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <User className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
                    <p className="text-gray-500 mb-6">Try adjusting your search or filters</p>
                    <button onClick={() => { setSearch(''); setFilters({ streamId: '', isActive: true }) }} className="btn btn-outline">
                        Clear Filters
                    </button>
                </div>
            ) : viewMode === 'list' ? (
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
                                {paginatedStudents.map((student) => (
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
                                        <td className="font-medium text-orange-600">{formatCurrency(student.balance || 0)}</td>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {paginatedStudents.map((student) => (
                        <div key={student.id} className="card hover:shadow-lg transition-shadow">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                                    {student.first_name[0]}{student.last_name[0]}
                                </div>
                                <div className="flex gap-1">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.student_type === 'BOARDER'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        {student.student_type === 'BOARDER' ? 'Boarder' : 'Day'}
                                    </span>
                                </div>
                            </div>
                            
                            <h3 className="font-bold text-gray-900 mb-1 truncate">
                                {student.first_name} {student.middle_name} {student.last_name}
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">{student.admission_number}</p>
                            
                            <div className="space-y-2 text-sm text-gray-600 mb-4">
                                <div className="flex justify-between">
                                    <span>Class:</span>
                                    <span className="font-medium text-gray-900">{student.stream_name || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Balance:</span>
                                    <span className="font-medium text-orange-600">{formatCurrency(student.balance || 0)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                                <button
                                    onClick={() => navigate(`/students/${student.id}`)}
                                    className="flex-1 btn btn-outline py-2 text-xs flex items-center justify-center gap-1"
                                >
                                    <Eye className="w-3 h-3" /> View
                                </button>
                                <button
                                    onClick={() => navigate(`/finance/payments?student=${student.id}`)}
                                    className="flex-1 btn btn-outline py-2 text-xs flex items-center justify-center gap-1"
                                >
                                    <CreditCard className="w-3 h-3" /> Pay
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            title="Previous Page"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            title="Next Page"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
