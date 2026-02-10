/* eslint-disable max-lines */

import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Download,
    Search,
    Settings,
    X
} from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'

import { Dropdown } from '../Dropdown'
import { EmptyState } from '../EmptyState'
import { Input } from '../Input'
import { Skeleton } from '../Skeleton'

import type {
    Column,
    DataTableBaseProps,
    DataTableComputedState,
    DataTableController,
    DataTableProps
} from './DataTable.types'

export type { Column, DataTableProps } from './DataTable.types'

function getNestedValue(obj: unknown, path: string): unknown {
    let current: unknown = obj
    for (const part of path.split('.')) {
        if (!current || typeof current !== 'object' || !(part in current)) {
            return undefined
        }
        current = (current as Record<string, unknown>)[part]
    }
    return current
}

function getAlignmentClass(align: Column<unknown>['align']): string {
    if (align === 'center') {
        return 'text-center'
    }
    if (align === 'right') {
        return 'text-right'
    }
    return ''
}

function filterAndSortRows<T extends { id: number | string }>(
    data: T[],
    searchTerm: string,
    visibleColumns: Array<Column<T> & { visible: boolean }>,
    sort: { key: string; direction: 'asc' | 'desc' } | null,
    useExternalSort: boolean
): T[] {
    let result = [...data]

    if (searchTerm) {
        const term = searchTerm.toLowerCase()
        result = result.filter((row) => visibleColumns.some((column) => {
            const value = getNestedValue(row, String(column.key))
            return String(value ?? '').toLowerCase().includes(term)
        }))
    }

    if (sort && !useExternalSort) {
        result.sort((leftRow, rightRow) => {
            const leftValue = getNestedValue(leftRow, sort.key)
            const rightValue = getNestedValue(rightRow, sort.key)
            if (leftValue === rightValue) {
                return 0
            }
            if (leftValue === null || leftValue === undefined) {
                return 1
            }
            if (rightValue === null || rightValue === undefined) {
                return -1
            }
            const comparison = leftValue < rightValue ? -1 : 1
            return sort.direction === 'asc' ? comparison : -comparison
        })
    }

    return result
}

function useDataTableState<T extends { id: number | string }>(props: Readonly<DataTableProps<T>>): DataTableComputedState<T> {
    const {
        columns: initialColumns,
        data,
        currentPage = 1,
        defaultSort,
        onPageChange,
        pageSize: initialPageSize = 10,
        paginated = true,
        selectedIds = new Set(),
        totalCount
    } = props

    const [columns, setColumns] = useState(initialColumns.map((column) => ({ ...column, visible: column.visible !== false })))
    const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort || null)
    const [searchTerm, setSearchTerm] = useState('')
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [internalPage, setInternalPage] = useState(currentPage)
    const [showColumnSelector, setShowColumnSelector] = useState(false)

    const page = onPageChange ? currentPage : internalPage
    const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns])
    const useExternalSort = typeof props.onSort === 'function'
    const processedData = useMemo(
        () => filterAndSortRows(data, searchTerm, visibleColumns, sort, useExternalSort),
        [data, searchTerm, visibleColumns, sort, useExternalSort]
    )
    const totalItems = totalCount ?? processedData.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const paginatedData = useMemo(() => {
        if (!paginated) {
            return processedData
        }
        const start = (page - 1) * pageSize
        return processedData.slice(start, start + pageSize)
    }, [page, pageSize, paginated, processedData])

    const allPageSelected = paginatedData.length > 0 && paginatedData.every((row) => selectedIds.has(row.id))

    return {
        columns,
        setColumns,
        sort,
        setSort,
        page,
        setInternalPage,
        pageSize,
        setPageSize,
        searchTerm,
        setSearchTerm,
        showColumnSelector,
        setShowColumnSelector,
        visibleColumns,
        totalItems,
        totalPages,
        paginatedData,
        allPageSelected
    }
}

function useDataTableHandlers<T extends { id: number | string }>(
    state: DataTableComputedState<T>,
    props: DataTableBaseProps
) {
    const { onPageChange, onPageSizeChange, onSelectionChange, onSort, selectedIds, sortable } = props

    const handleSort = useCallback((key: string) => {
        if (!sortable) {
            return
        }
        const direction: 'asc' | 'desc' = state.sort?.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc'
        state.setSort({ key, direction })
        onSort?.(key, direction)
    }, [onSort, sortable, state])

    const handleSelectAll = useCallback(() => {
        if (!onSelectionChange) {
            return
        }
        const updatedSelection = new Set(selectedIds)
        if (state.allPageSelected) {
            state.paginatedData.forEach((row) => updatedSelection.delete(row.id))
        } else {
            state.paginatedData.forEach((row) => updatedSelection.add(row.id))
        }
        onSelectionChange(updatedSelection)
    }, [onSelectionChange, selectedIds, state])

    const handleSelectRow = useCallback((id: number | string) => {
        if (!onSelectionChange) {
            return
        }
        const updatedSelection = new Set(selectedIds)
        if (updatedSelection.has(id)) {
            updatedSelection.delete(id)
        } else {
            updatedSelection.add(id)
        }
        onSelectionChange(updatedSelection)
    }, [onSelectionChange, selectedIds])

    const handlePageChange = useCallback((newPage: number) => {
        if (newPage < 1 || newPage > state.totalPages) {
            return
        }
        if (onPageChange) {
            onPageChange(newPage)
        } else {
            state.setInternalPage(newPage)
        }
    }, [onPageChange, state])

    return {
        handleSort,
        handleSelectAll,
        handleSelectRow,
        handlePageChange,
        toggleColumnVisibility: (key: string) => {
            state.setColumns((previous) => previous.map((column) => {
                return String(column.key) === key ? { ...column, visible: !column.visible } : column
            }))
        },
        setPageSizeAndNotify: (newSize: number) => {
            state.setPageSize(newSize)
            onPageSizeChange?.(newSize)
        }
    }
}

function useDataTableController<T extends { id: number | string }>(props: Readonly<DataTableProps<T>>): DataTableController<T> {
    const {
        onPageChange,
        onPageSizeChange,
        onSelectionChange,
        onSort,
        selectedIds = new Set(),
        sortable = true
    } = props

    const state = useDataTableState(props)
    const handlers = useDataTableHandlers(state, {
        onPageChange,
        onPageSizeChange,
        onSelectionChange,
        onSort,
        selectedIds,
        sortable
    })

    return {
        columns: state.columns,
        visibleColumns: state.visibleColumns,
        page: state.page,
        pageSize: state.pageSize,
        searchTerm: state.searchTerm,
        setSearchTerm: state.setSearchTerm,
        showColumnSelector: state.showColumnSelector,
        setShowColumnSelector: state.setShowColumnSelector,
        sort: state.sort,
        totalItems: state.totalItems,
        totalPages: state.totalPages,
        paginatedData: state.paginatedData,
        allPageSelected: state.allPageSelected,
        toggleColumnVisibility: handlers.toggleColumnVisibility,
        handleSort: handlers.handleSort,
        handleSelectAll: handlers.handleSelectAll,
        handleSelectRow: handlers.handleSelectRow,
        handlePageChange: handlers.handlePageChange,
        setPageSizeAndNotify: handlers.setPageSizeAndNotify
    }
}

function DataTableLoadingState() {
    const skeletonKeys = useMemo(
        () => Array.from({ length: 5 }, () => globalThis.crypto.randomUUID()),
        []
    )

    return (
        <div className="w-full space-y-4">
            <div className="flex justify-between items-center">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="space-y-2">
                {skeletonKeys.map((key) => (
                    <Skeleton key={key} className="h-12 w-full" />
                ))}
            </div>
        </div>
    )
}

interface DataTableToolbarProps<T extends { id: number | string }> {
    controller: DataTableController<T>
    onExport?: (format: 'csv' | 'excel' | 'pdf') => void
}

function DataTableToolbar<T extends { id: number | string }>({ controller, onExport }: Readonly<DataTableToolbarProps<T>>) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                    type="text"
                    placeholder="Search..."
                    value={controller.searchTerm}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => controller.setSearchTerm(event.target.value)}
                    className="pl-10"
                />
                {controller.searchTerm && (
                    <button onClick={() => controller.setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                <div className="relative">
                    <button onClick={() => controller.setShowColumnSelector(!controller.showColumnSelector)} className="p-2 hover:bg-secondary rounded-lg border border-border/40" title="Toggle columns">
                        <Settings className="w-4 h-4" />
                    </button>
                    {controller.showColumnSelector && (
                        <div className="absolute right-0 top-full mt-2 bg-card border border-border/40 rounded-lg shadow-xl z-50 min-w-[200px]">
                            <div className="p-2 border-b border-border/40 text-xs font-bold text-foreground/60 uppercase">Visible Columns</div>
                            <div className="p-2 space-y-1">
                                {controller.columns.map((column) => (
                                    <label key={String(column.key)} className="flex items-center gap-2 px-2 py-1 hover:bg-secondary rounded cursor-pointer text-foreground/80">
                                        <input type="checkbox" checked={column.visible} onChange={() => controller.toggleColumnVisibility(String(column.key))} className="rounded border-border/40" />
                                        <span className="text-sm">{column.header}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {onExport && (
                    <Dropdown
                        trigger={<button className="p-2 hover:bg-secondary rounded-lg border border-border/40" title="Export"><Download className="w-4 h-4 text-foreground/80" /></button>}
                        items={[
                            { label: 'Export as CSV', onClick: () => onExport('csv') },
                            { label: 'Export as Excel', onClick: () => onExport('excel') },
                            { label: 'Export as PDF', onClick: () => onExport('pdf') }
                        ]}
                    />
                )}
            </div>
        </div>
    )
}

interface DataTableGridProps<T extends { id: number | string }> {
    controller: DataTableController<T>
    data: T[]
    selectable: boolean
    selectedIds: Set<number | string>
    sortable: boolean
    rowClassName?: (row: T, index: number) => string
    onRowClick?: (row: T) => void
    compact: boolean
    stickyHeader: boolean
}

function DataTableGrid<T extends { id: number | string }>({
    controller,
    data,
    selectable,
    selectedIds,
    sortable,
    rowClassName,
    onRowClick,
    compact,
    stickyHeader
}: Readonly<DataTableGridProps<T>>) {
    const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3'
    const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-4'

    if (!data.length && !controller.searchTerm) {
        return null
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full">
                <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
                    <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border/40">
                        {selectable && (
                            <th className={`${headerPadding} w-12`}>
                                <input type="checkbox" checked={controller.allPageSelected} onChange={controller.handleSelectAll} className="rounded border-border/20" />
                            </th>
                        )}
                        {controller.visibleColumns.map((column) => {
                            const columnKey = String(column.key)
                            const isSorted = controller.sort?.key === columnKey && column.sortable !== false && sortable
                            return (
                                <th
                                    key={columnKey}
                                    className={`${headerPadding} text-left text-[11px] font-bold uppercase tracking-wider text-foreground/50 ${column.sortable !== false && sortable ? 'cursor-pointer hover:text-foreground/80 select-none' : ''} ${getAlignmentClass(column.align)}`}
                                    onClick={() => column.sortable !== false && controller.handleSort(columnKey)}
                                >
                                    <div className="flex items-center gap-1">
                                        <span>{column.header}</span>
                                        {isSorted && (controller.sort?.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </div>
                                </th>
                            )
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                    {controller.paginatedData.map((row, index) => (
                        <tr
                            key={row.id}
                            onClick={() => onRowClick?.(row)}
                            className={`transition-colors hover:bg-secondary/40 ${onRowClick ? 'cursor-pointer' : ''} ${selectedIds.has(row.id) ? 'bg-primary/5' : ''} ${rowClassName ? rowClassName(row, index) : ''}`}
                        >
                            {selectable && (
                                <td className={cellPadding} onClick={(event) => event.stopPropagation()}>
                                    <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => controller.handleSelectRow(row.id)} className="rounded border-border/40" />
                                </td>
                            )}
                            {controller.visibleColumns.map((column) => {
                                const value = getNestedValue(row, String(column.key))
                                return (
                                    <td key={String(column.key)} className={`${cellPadding} text-sm text-foreground/70 ${getAlignmentClass(column.align)}`}>
                                        {column.render ? column.render(value, row, index) : String(value ?? '-')}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

interface PaginationProps {
    page: number
    pageSize: number
    pageSizeOptions: number[]
    totalItems: number
    totalPages: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
}

function DataTablePagination({
    page,
    pageSize,
    pageSizeOptions,
    totalItems,
    totalPages,
    onPageChange,
    onPageSizeChange
}: Readonly<PaginationProps>) {
    const pageNumbers = useMemo(
        () => Array.from({ length: totalPages }, (_, index) => index + 1),
        [totalPages]
    )

    if (totalPages <= 1) {
        return null
    }

    return (
        <div className="flex items-center justify-between mt-4 text-sm text-foreground/40">
            <div className="flex items-center gap-4">
                <div>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalItems)} of {totalItems} entries</div>
                <select
                    value={pageSize}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    className="bg-transparent border border-border/40 rounded px-2 py-1 outline-none"
                >
                    {pageSizeOptions.map((option) => (
                        <option key={option} value={option} className="bg-secondary">{option} per page</option>
                    ))}
                </select>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-2 hover:bg-secondary disabled:opacity-30 rounded-lg border border-border/40">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                    {pageNumbers.map((pageNumber) => (
                        <button
                            key={pageNumber}
                            onClick={() => onPageChange(pageNumber)}
                            className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${page === pageNumber ? 'bg-primary text-primary-foreground shadow-lg' : 'hover:bg-secondary'}`}
                        >
                            {pageNumber}
                        </button>
                    ))}
                </div>
                <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="p-2 hover:bg-secondary disabled:opacity-30 rounded-lg border border-border/40">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

interface DataTableContentProps<T extends { id: number | string }> {
    controller: DataTableController<T>
    props: Readonly<DataTableProps<T>>
}

function DataTableContent<T extends { id: number | string }>({ controller, props }: Readonly<DataTableContentProps<T>>) {
    const {
        data,
        onExport,
        onRowClick,
        pageSizeOptions = [10, 25, 50, 100],
        rowClassName,
        selectedIds = new Set(),
        paginated = true,
        selectable = false,
        sortable = true,
        stickyHeader = true,
        compact = false
    } = props

    return (
        <div className="w-full">
            <DataTableToolbar controller={controller} onExport={onExport} />
            <DataTableGrid
                controller={controller}
                data={data}
                selectable={selectable}
                selectedIds={selectedIds}
                sortable={sortable}
                rowClassName={rowClassName}
                onRowClick={onRowClick}
                compact={compact}
                stickyHeader={stickyHeader}
            />
            {paginated && (
                <DataTablePagination
                    page={controller.page}
                    pageSize={controller.pageSize}
                    pageSizeOptions={pageSizeOptions}
                    totalItems={controller.totalItems}
                    totalPages={controller.totalPages}
                    onPageChange={controller.handlePageChange}
                    onPageSizeChange={controller.setPageSizeAndNotify}
                />
            )}
        </div>
    )
}

export function DataTable<T extends { id: number | string }>(props: Readonly<DataTableProps<T>>) {
    const controller = useDataTableController(props)

    if (props.loading) {
        return <DataTableLoadingState />
    }
    if (!props.data.length && !controller.searchTerm) {
        return <EmptyState icon={props.emptyIcon} title={props.emptyMessage || 'No data available'} description="Try adjusting your filters or add new records." />
    }

    return <DataTableContent controller={controller} props={props} />
}
