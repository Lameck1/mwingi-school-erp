import React, { useState, useMemo, useCallback } from 'react'
import {
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Settings, Download, Search, X
} from 'lucide-react'
import { Skeleton } from '../Skeleton'
import { EmptyState } from '../EmptyState'
import { Dropdown } from '../Dropdown'
import { Input } from '../Input'

export interface Column<T> {
    key: keyof T | string
    header: string
    width?: number
    minWidth?: number
    sortable?: boolean
    visible?: boolean
    frozen?: boolean
    align?: 'left' | 'center' | 'right'
    render?: (value: unknown, row: T, index: number) => React.ReactNode
}

export interface DataTableProps<T extends { id: number | string }> {
    data: T[]
    columns: Column<T>[]
    loading?: boolean
    emptyMessage?: string
    emptyIcon?: React.ReactNode

    // Selection
    selectable?: boolean
    selectedIds?: Set<number | string>
    onSelectionChange?: (selectedIds: Set<number | string>) => void

    // Pagination
    paginated?: boolean
    pageSize?: number
    pageSizeOptions?: number[]
    totalCount?: number
    currentPage?: number
    onPageChange?: (page: number) => void
    onPageSizeChange?: (size: number) => void

    // Sorting
    sortable?: boolean
    defaultSort?: { key: string; direction: 'asc' | 'desc' }
    onSort?: (key: string, direction: 'asc' | 'desc') => void

    // Actions
    onRowClick?: (row: T) => void
    onExport?: (format: 'csv' | 'excel' | 'pdf') => void

    // Customization
    rowClassName?: (row: T, index: number) => string
    stickyHeader?: boolean
    compact?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNestedValue(obj: unknown, path: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return path.split('.').reduce((acc, part) => acc && (acc as any)[part], obj)
}

export function DataTable<T extends { id: number | string }>({
    data,
    columns: initialColumns,
    loading = false,
    emptyMessage = 'No data available',
    emptyIcon,
    selectable = false,
    selectedIds = new Set(),
    onSelectionChange,
    paginated = true,
    pageSize: initialPageSize = 10,
    pageSizeOptions = [10, 25, 50, 100],
    totalCount,
    currentPage = 1,
    onPageChange,
    onPageSizeChange,
    sortable = true,
    defaultSort,
    onSort,
    onRowClick,
    onExport,
    rowClassName,
    stickyHeader = true,
    compact = false,
}: DataTableProps<T>) {
    // State
    const [columns, setColumns] = useState(initialColumns.map(c => ({ ...c, visible: c.visible !== false })))
    const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort || null)
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [internalPage, setInternalPage] = useState(currentPage)
    const [searchTerm, setSearchTerm] = useState('')
    const [showColumnSelector, setShowColumnSelector] = useState(false)

    const page = onPageChange ? currentPage : internalPage

    // Visible columns
    const visibleColumns = useMemo(() => columns.filter(c => c.visible), [columns])

    // Sorted and filtered data
    const processedData = useMemo(() => {
        let result = [...data]

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(row =>
                visibleColumns.some(col => {
                    const value = getNestedValue(row, col.key as string)
                    return String(value ?? '').toLowerCase().includes(term)
                })
            )
        }

        // Sort
        if (sort && !onSort) {
            result.sort((a, b) => {
                const aVal = getNestedValue(a, sort.key)
                const bVal = getNestedValue(b, sort.key)

                if (aVal === bVal) return 0
                if (aVal === null || aVal === undefined) return 1
                if (bVal === null || bVal === undefined) return -1

                const comparison = aVal < bVal ? -1 : 1
                return sort.direction === 'asc' ? comparison : -comparison
            })
        }

        return result
    }, [data, searchTerm, sort, visibleColumns, onSort])

    // Pagination
    const totalItems = totalCount ?? processedData.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const paginatedData = useMemo(() => {
        if (!paginated) return processedData
        const start = (page - 1) * pageSize
        return processedData.slice(start, start + pageSize)
    }, [processedData, paginated, page, pageSize])

    // Handlers
    const handleSort = useCallback((key: string) => {
        if (!sortable) return

        const newDirection = sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc'
        const newSort = { key, direction: newDirection as 'asc' | 'desc' }

        setSort(newSort)
        onSort?.(key, newDirection)
    }, [sort, sortable, onSort])

    const handleSelectAll = useCallback(() => {
        if (!onSelectionChange) return

        const allSelected = paginatedData.length > 0 && paginatedData.every(row => selectedIds.has(row.id))

        if (allSelected) {
            const newSelected = new Set(selectedIds)
            paginatedData.forEach(row => newSelected.delete(row.id))
            onSelectionChange(newSelected)
        } else {
            const newSelected = new Set(selectedIds)
            paginatedData.forEach(row => newSelected.add(row.id))
            onSelectionChange(newSelected)
        }
    }, [paginatedData, selectedIds, onSelectionChange])

    const handleSelectRow = useCallback((id: number | string) => {
        if (!onSelectionChange) return

        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        onSelectionChange(newSelected)
    }, [selectedIds, onSelectionChange])

    const handlePageChange = useCallback((newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return
        if (onPageChange) {
            onPageChange(newPage)
        } else {
            setInternalPage(newPage)
        }
    }, [totalPages, onPageChange])

    const toggleColumnVisibility = useCallback((key: string) => {
        setColumns(prev => prev.map(col =>
            (col.key as string) === key ? { ...col, visible: !col.visible } : col
        ))
    }, [])

    // Render
    if (loading) {
        return (
            <div className="w-full space-y-4">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            </div>
        )
    }

    if (!data.length && !searchTerm) {
        return (
            <EmptyState
                icon={emptyIcon}
                title={emptyMessage}
                description="Try adjusting your filters or add new records."
            />
        )
    }

    const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-4'
    const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3'

    return (
        <div className="w-full">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <Input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Column selector */}
                    <div className="relative">
                        <button
                            onClick={() => setShowColumnSelector(!showColumnSelector)}
                            className="p-2 hover:bg-secondary rounded-lg border border-border/40"
                            title="Toggle columns"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {showColumnSelector && (
                            <div className="absolute right-0 top-full mt-2 bg-card border border-border/40 rounded-lg shadow-xl z-50 min-w-[200px]">
                                <div className="p-2 border-b border-border/40 text-xs font-bold text-foreground/60 uppercase">
                                    Visible Columns
                                </div>
                                <div className="p-2 space-y-1">
                                    {columns.map(col => (
                                        <label key={col.key as string} className="flex items-center gap-2 px-2 py-1 hover:bg-secondary rounded cursor-pointer text-foreground/80">
                                            <input
                                                type="checkbox"
                                                checked={col.visible}
                                                onChange={() => toggleColumnVisibility(col.key as string)}
                                                className="rounded border-border/40"
                                            />
                                            <span className="text-sm">{col.header}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Export */}
                    {onExport && (
                        <Dropdown
                            trigger={
                                <button className="p-2 hover:bg-secondary rounded-lg border border-border/40" title="Export">
                                    <Download className="w-4 h-4 text-foreground/80" />
                                </button>
                            }
                            items={[
                                { label: 'Export as CSV', onClick: () => onExport('csv') },
                                { label: 'Export as Excel', onClick: () => onExport('excel') },
                                { label: 'Export as PDF', onClick: () => onExport('pdf') },
                            ]}
                        />
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-border/40">
                <table className="w-full">
                    <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
                        <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border/40">
                            {selectable && (
                                <th className={`${headerPadding} w-12`}>
                                    <input
                                        type="checkbox"
                                        checked={paginatedData.length > 0 && paginatedData.every(row => selectedIds.has(row.id))}
                                        onChange={handleSelectAll}
                                        className="rounded border-border/20"
                                    />
                                </th>
                            )}
                            {visibleColumns.map(col => (
                                <th
                                    key={col.key as string}
                                    className={`
                    ${headerPadding} text-left text-[11px] font-bold uppercase tracking-wider text-foreground/50
                    ${col.sortable !== false && sortable ? 'cursor-pointer hover:text-foreground/80 select-none' : ''}
                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                  `}
                                    onClick={() => col.sortable !== false && handleSort(col.key as string)}
                                >
                                    <div className="flex items-center gap-1">
                                        <span>{col.header}</span>
                                        {col.sortable !== false && sortable && sort?.key === col.key && (
                                            sort.direction === 'asc'
                                                ? <ChevronUp className="w-3 h-3" />
                                                : <ChevronDown className="w-3 h-3" />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {paginatedData.map((row, i) => (
                            <tr
                                key={row.id}
                                onClick={() => onRowClick?.(row)}
                                className={`
                  transition-colors hover:bg-secondary/40
                  ${onRowClick ? 'cursor-pointer' : ''}
                  ${selectedIds.has(row.id) ? 'bg-primary/5' : ''}
                  ${rowClassName ? rowClassName(row, i) : ''}
                `}
                            >
                                {selectable && (
                                    <td className={cellPadding} onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(row.id)}
                                            onChange={() => handleSelectRow(row.id)}
                                            className="rounded border-border/40"
                                        />
                                    </td>
                                )}
                                {visibleColumns.map(col => (
                                    <td
                                        key={col.key as string}
                                        className={`
                      ${cellPadding} text-sm text-foreground/70
                      ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                    `}
                                    >
                                        {col.render
                                            ? col.render(getNestedValue(row, col.key as string), row, i)
                                            : String(getNestedValue(row, col.key as string) ?? '-')
                                        }
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {paginated && totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-foreground/40">
                    <div className="flex items-center gap-4">
                        <div>
                            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalItems)} of {totalItems} entries
                        </div>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                const newSize = Number(e.target.value);
                                setPageSize(newSize);
                                onPageSizeChange?.(newSize);
                            }}
                            className="bg-transparent border border-border/40 rounded px-2 py-1 outline-none"
                        >
                            {pageSizeOptions.map(option => (
                                <option key={option} value={option} className="bg-secondary">{option} per page</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(page - 1)}
                            disabled={page === 1}
                            className="p-2 hover:bg-secondary disabled:opacity-30 rounded-lg border border-border/40"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => handlePageChange(i + 1)}
                                    className={`
                    w-8 h-8 rounded-lg text-xs font-medium transition-all
                    ${page === i + 1 ? 'bg-primary text-primary-foreground shadow-lg' : 'hover:bg-secondary'}
                  `}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => handlePageChange(page + 1)}
                            disabled={page === totalPages}
                            className="p-2 hover:bg-secondary disabled:opacity-30 rounded-lg border border-border/40"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

