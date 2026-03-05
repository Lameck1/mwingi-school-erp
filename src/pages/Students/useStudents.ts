import type React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { useToast } from '../../contexts/ToastContext'
import { useAppStore } from '../../stores'
import { type Stream } from '../../types/electron-api/AcademicAPI'
import { type Student } from '../../types/electron-api/StudentAPI'
import { normalizeFilters } from '../../utils/filters'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'
import { printDocument } from '../../utils/print'

export function useStudents() {
    const navigate = useNavigate()
    const location = useLocation()
    const { showToast } = useToast()
    const schoolSettings = useAppStore((s) => s.schoolSettings)
    const [students, setStudents] = useState<Student[]>([])
    const [totalCount, setTotalCount] = useState(0)
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

    const loadStudents = useCallback(async (page = currentPage) => {
        setLoading(true)
        try {
            const result = unwrapIPCResult<{ rows: Student[]; totalCount: number; page: number; pageSize: number }>(
                await globalThis.electronAPI.students.getStudents(normalizeFilters({
                    streamId: filters.streamId || undefined,
                    isActive: filters.isActive ?? undefined,
                    search: searchRef.current || undefined,
                    page,
                    pageSize: itemsPerPage,
                }) as Parameters<typeof globalThis.electronAPI.students.getStudents>[0]),
                'Failed to load students'
            )
            setStudents(result.rows ?? [])
            setTotalCount(result.totalCount ?? 0)
        } catch (error) {
            console.error('Failed to load students:', error)
            setStudents([])
            setTotalCount(0)
            showToast(error instanceof Error ? error.message : 'Failed to load students', 'error')
        } finally {
            setLoading(false)
        }
    }, [filters, showToast, currentPage])

    const loadData = useCallback(async () => {
        try {
            const streamsData = unwrapArrayResult(await globalThis.electronAPI.academic.getStreams(), 'Failed to load streams')
            setStreams(streamsData)
            await loadStudents(1)
        } catch (error) {
            console.error('Failed to load data:', error)
            setStreams([])
            setStudents([])
            setTotalCount(0)
            setLoading(false)
            showToast(error instanceof Error ? error.message : 'Failed to load data', 'error')
        }
    }, [loadStudents, showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load student data', err))
    }, [loadData])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        if (params.get('import') === '1') {
            setShowImport(true)
        }
    }, [location.search])

    useEffect(() => {
        const unsubscribe = globalThis.electronAPI.menuEvents.onOpenImportDialog(() => {
            setShowImport(true)
        })
        return () => unsubscribe()
    }, [])

    const handleSearch = (e: React.SyntheticEvent) => {
        e.preventDefault()
        loadStudents().catch((err: unknown) => console.error('Failed to search students', err))
    }

    useEffect(() => {
        setCurrentPage(1)
    }, [search, filters.streamId, filters.isActive])

    useEffect(() => {
        loadStudents(currentPage).catch((err: unknown) => console.error('Failed to load students page', err))
    }, [currentPage, loadStudents])

    const totalPages = Math.ceil(totalCount / itemsPerPage)

    const handlePrintStatement = async (student: Student) => {
        setPrintingId(student.id)
        try {
            const result = unwrapIPCResult<{
                student?: Record<string, unknown>
                ledger: Record<string, unknown>[]
                openingBalance: number
                closingBalance: number
                error?: string
            }>(
                await globalThis.electronAPI.reports.getStudentLedgerReport(student.id),
                'Failed to load ledger data'
            )
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
                schoolSettings: (schoolSettings ? { ...schoolSettings } : undefined) as Record<string, unknown>
            })
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Error generating statement', 'error')
        } finally {
            setPrintingId(null)
        }
    }

    const openImport = () => setShowImport(true)
    const closeImport = () => setShowImport(false)
    const onImportSuccess = () => {
        setShowImport(false)
        showToast('Students imported successfully', 'success')
        loadStudents().catch((err: unknown) => console.error('Failed to reload students after import', err))
    }

    return {
        // data
        students,
        totalCount,
        streams,
        // ui state
        loading,
        printingId,
        search,
        showImport,
        filters,
        currentPage,
        viewMode,
        itemsPerPage,
        totalPages,
        // navigation
        navigate,
        // setters
        setSearch,
        setFilters,
        setCurrentPage,
        setViewMode,
        // actions
        handleSearch,
        handlePrintStatement,
        openImport,
        closeImport,
        onImportSuccess,
    }
}
