import {
    Search, Plus, ChevronLeft, ChevronRight, Edit,
    LayoutGrid, List as ListIcon,
    Printer, Loader2, Wallet, Users, Upload
} from 'lucide-react'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

import { ImportDialog } from '../../components/ui/ImportDialog'
import { useToast } from '../../contexts/ToastContext'
import { useAppStore } from '../../stores'
import { type Stream } from '../../types/electron-api/AcademicAPI'
import { type Student } from '../../types/electron-api/StudentAPI'
import { formatCurrencyFromCents } from '../../utils/format'
import { printDocument } from '../../utils/print'

interface StudentLedgerResult {
    student: Student;
    openingBalance: number;
    ledger: Record<string, unknown>[];
    closingBalance: number;
    error?: string;
}

export default function Students() {
    const navigate = useNavigate()
    const location = useLocation()
    const { showToast } = useToast()
    const { schoolSettings } = useAppStore()
    const [students, setStudents] = useState<Student[]>([])
    const [printingId, setPrintingId] = useState<number | null>(null)
    const [streams, setStreams] = useState<Stream[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showImport, setShowImport] = useState(false)
    const [filters, setFilters] = useState({ streamId: '', isActive: true })
    const [currentPage, setCurrentPage] = useState(1)
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
    const itemsPerPage = 12
    const searchRef = useRef(search)

    useEffect(() => {
        searchRef.current = search
    }, [search])

    const loadStudents = useCallback(async () => {
        setLoading(true)
        try {
            const data = await window.electronAPI.getStudents({
                ...filters,
                search: searchRef.current || undefined
            })
            setStudents(data)
        } catch (error) {
            console.error('Failed to load students:', error)
            showToast('Failed to load students', 'error')
        } finally {
            setLoading(false)
        }
    }, [filters, showToast])

    const loadData = useCallback(async () => {
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
    }, [loadStudents, showToast])

    useEffect(() => {
        void loadData()
    }, [loadData])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        if (params.get('import') === '1') {
            setShowImport(true)
        }
    }, [location.search])

    useEffect(() => {
        const unsubscribe = window.electronAPI.onOpenImportDialog(() => {
            setShowImport(true)
        })
        return () => unsubscribe()
    }, [])

    useEffect(() => {
        void loadStudents()
    }, [loadStudents])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        void loadStudents()
    }

    const filteredStudents = students
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage)
    const paginatedStudents = filteredStudents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )




    const handlePrintStatement = async (student: Student) => {
        setPrintingId(student.id)
        try {
            const result = await window.electronAPI.getStudentLedgerReport(student.id) as unknown as StudentLedgerResult
            if (result && !result.error) {
                printDocument({
                    title: `Statement - ${student.first_name} ${student.last_name}`,
                    template: 'statement',
                    data: {
                        studentName: `${student.first_name} ${student.middle_name || ''} ${student.last_name}`,
                        admissionNumber: student.admission_number,
                        streamName: student.stream_name,
                        openingBalance: result.openingBalance,
                        ledger: result.ledger,
                        closingBalance: result.closingBalance
                    },
                    schoolSettings: (schoolSettings as unknown as Record<string, unknown>) || undefined
                })
            } else {
                showToast('Failed to load ledger data', 'error')
            }
        } catch (error) {
            console.error(error)
            showToast('Error generating statement', 'error')
        } finally {
            setPrintingId(null)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading">Registry & Students</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Manage official student records and enrollment pipelines</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-secondary/30 rounded-xl p-1 border border-border/20">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary shadow-lg text-primary-foreground' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            <ListIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2.5 rounded-lg transition-all duration-300 ${viewMode === 'grid' ? 'bg-primary shadow-lg text-primary-foreground' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                    </div>
                    <Link
                        to="/students/new"
                        className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Admit New Student
                    </Link>
                </div>
            </div>

            <div className="flex justify-end px-1">
                <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all duration-300"
                >
                    <Upload className="w-4 h-4" />
                    Import Students via Excel/CSV
                </button>
            </div>

            {/* Global Search & Filters Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-2 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Quick search by name or admission number..."
                            className="input pl-11 py-3.5 bg-secondary/30 border-border/20 focus:border-primary/50 transition-all w-full"
                        />
                    </form>
                </div>
                <div>
                    <select
                        value={filters.streamId}
                        onChange={(e) => setFilters(prev => ({ ...prev, streamId: e.target.value }))}
                        className="input py-3.5 bg-secondary/30 border-border/20 focus:border-primary/50 transition-all font-medium"
                        aria-label="Filter by Stream"
                    >
                        <option value="" className="bg-background">All Learning Streams</option>
                        {streams.map((s) => (
                            <option key={s.id} value={s.id} className="bg-background">{s.stream_name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <select
                        value={filters.isActive ? 'active' : 'inactive'}
                        onChange={(e) => setFilters(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                        className="input py-3.5 bg-secondary/30 border-border/20 focus:border-primary/50 transition-all font-medium"
                        aria-label="Filter by Status"
                    >
                        <option value="active" className="bg-background">Active Enrollment</option>
                        <option value="inactive" className="bg-background">Inactive / Alumni</option>
                    </select>
                </div>
            </div>

            {/* Main Data View */}
            {(() => {
                if (loading) {
                    return (
                        <div className="card flex flex-col items-center justify-center py-24 gap-4">
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">Synchronizing Records...</p>
                        </div>
                    )
                }

                if (filteredStudents.length === 0) {
                    return (
                        <div className="card text-center py-24">
                            <Users className="w-20 h-20 mx-auto mb-6 text-foreground/5" />
                            <h3 className="text-xl font-bold text-foreground mb-2">No Records Found</h3>
                            <p className="text-foreground/30 font-medium">Verify your search criteria or add a new student record.</p>
                        </div>
                    )
                }

                if (viewMode === 'list') {
                    return (
                        <div className="card animate-slide-up no-scrollbar">
                    <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border/20">
                                    <th className="px-4 py-4">Student Identity</th>
                                    <th className="px-4 py-4">Academic Placement</th>
                                    <th className="px-4 py-4 text-right">Balance Due</th>
                                    <th className="px-4 py-4">Status</th>
                                    <th className="px-4 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {paginatedStudents.map((student) => (
                                    <tr key={student.id} className="group hover:bg-accent/20 transition-colors">
                                        <td className="px-4 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shadow-inner group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                                    {student.first_name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                                                        {student.first_name} {student.last_name}
                                                    </p>
                                                    <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest">
                                                        ADM: {student.admission_number}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-5">
                                            <p className="font-bold text-foreground">{student.first_name} {student.last_name}</p>
                                            <p className="text-[10px] text-foreground/40 font-mono">{student.admission_number}</p>
                                        </td>
                                        <td className="px-4 py-5 text-right">
                                            <p className={`text-xs font-bold ${(student.balance || 0) > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-500'}`}>
                                                {formatCurrencyFromCents(student.balance || 0)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-5">
                                            <span className={`text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${student.is_active
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                                                }`}>
                                                {student.is_active ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => navigate(`/fee-payment?student=${student.id}`)}
                                                    className="p-2 bg-secondary/50 hover:bg-primary/20 text-primary rounded-lg transition-all"
                                                    title="Collect Fees"
                                                    aria-label={`Collect fees for ${student.first_name} ${student.last_name}`}
                                                >
                                                    <Wallet className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                                <button
                                                    onClick={() => handlePrintStatement(student)}
                                                    className="p-2 bg-secondary/50 hover:bg-accent/20 text-foreground/40 hover:text-foreground rounded-lg transition-all"
                                                    title="Print Statement"
                                                    disabled={printingId === student.id}
                                                    aria-label={`Print statement for ${student.first_name} ${student.last_name}`}
                                                >
                                                    {printingId === student.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Printer className="w-4 h-4" aria-hidden="true" />}
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/students/${student.id}`)}
                                                    className="p-2 bg-secondary/50 hover:bg-accent/20 text-foreground/40 hover:text-foreground rounded-lg transition-all"
                                                    title="Edit Profile"
                                                    aria-label={`Edit profile for ${student.first_name} ${student.last_name}`}
                                                >
                                                    <Edit className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                    )
                }

                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {paginatedStudents.map((student) => (
                        <div key={student.id} className="card group hover:-translate-y-1 transition-all duration-300">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground font-bold text-lg shadow-inner group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                    {student.first_name[0]}{student.last_name[0]}
                                </div>
                                <span className={`text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded-md border ${student.student_type === 'BOARDER'
                                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                    }`}>
                                    {student.student_type}
                                </span>
                            </div>

                            <h3 className="font-bold text-foreground mb-1 truncate group-hover:text-primary transition-colors">
                                {student.first_name} {student.last_name}
                            </h3>
                            <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest mb-4">ADM: {student.admission_number}</p>

                            <div className="space-y-3 pt-4 border-t border-border/40">
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-foreground/40 font-bold uppercase tracking-tighter">Placement</span>
                                    <span className="text-foreground font-bold">{student.stream_name || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-foreground/40 font-bold uppercase tracking-tighter">Outstanding</span>
                                    <span className={`font-bold ${(student.balance || 0) > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                        {formatCurrencyFromCents(student.balance || 0)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-6">
                                <button
                                    onClick={() => navigate(`/students/${student.id}`)}
                                    className="flex-1 py-2 bg-secondary/50 hover:bg-secondary/80 text-foreground text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300"
                                >
                                    Profile
                                </button>
                                <button
                                    onClick={() => navigate(`/fee-payment?student=${student.id}`)}
                                    className="flex-1 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300"
                                >
                                    Pay
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                )
            })()}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8 pt-8 border-t border-border/20 px-2">
                    <p className="text-xs font-medium text-foreground/40">
                        Displaying records <span className="text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-foreground">{Math.min(currentPage * itemsPerPage, filteredStudents.length)}</span> of <span className="text-foreground">{filteredStudents.length}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-3 bg-secondary/50 hover:bg-secondary text-foreground rounded-xl disabled:opacity-20 transition-all border border-border/40"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-1 px-4">
                            <span className="text-sm font-bold text-foreground">{currentPage}</span>
                            <span className="text-sm font-bold text-foreground/20">/</span>
                            <span className="text-sm font-bold text-foreground/40">{totalPages}</span>
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-3 bg-secondary/50 hover:bg-secondary/80 text-foreground rounded-xl disabled:opacity-20 transition-all border border-border/40 duration-300"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            <ImportDialog
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onSuccess={() => {
                    setShowImport(false)
                    showToast('Students imported successfully', 'success')
                    void loadStudents()
                }}
                entityType="STUDENT"
                title="Import Students"
            />
        </div>
    )
}
