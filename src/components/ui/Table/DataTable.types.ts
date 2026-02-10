import type React from 'react'

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
    selectable?: boolean
    selectedIds?: Set<number | string>
    onSelectionChange?: (selectedIds: Set<number | string>) => void
    paginated?: boolean
    pageSize?: number
    pageSizeOptions?: number[]
    totalCount?: number
    currentPage?: number
    onPageChange?: (page: number) => void
    onPageSizeChange?: (size: number) => void
    sortable?: boolean
    defaultSort?: { key: string; direction: 'asc' | 'desc' }
    onSort?: (key: string, direction: 'asc' | 'desc') => void
    onRowClick?: (row: T) => void
    onExport?: (format: 'csv' | 'excel' | 'pdf') => void
    rowClassName?: (row: T, index: number) => string
    stickyHeader?: boolean
    compact?: boolean
}

export interface DataTableController<T extends { id: number | string }> {
    columns: Array<Column<T> & { visible: boolean }>
    visibleColumns: Array<Column<T> & { visible: boolean }>
    page: number
    pageSize: number
    searchTerm: string
    setSearchTerm: (value: string) => void
    showColumnSelector: boolean
    setShowColumnSelector: (value: boolean) => void
    sort: { key: string; direction: 'asc' | 'desc' } | null
    totalItems: number
    totalPages: number
    paginatedData: T[]
    allPageSelected: boolean
    toggleColumnVisibility: (key: string) => void
    handleSort: (key: string) => void
    handleSelectAll: () => void
    handleSelectRow: (id: number | string) => void
    handlePageChange: (newPage: number) => void
    setPageSizeAndNotify: (newSize: number) => void
}

export interface DataTableComputedState<T extends { id: number | string }> {
    columns: Array<Column<T> & { visible: boolean }>
    setColumns: React.Dispatch<React.SetStateAction<Array<Column<T> & { visible: boolean }>>>
    sort: { key: string; direction: 'asc' | 'desc' } | null
    setSort: React.Dispatch<React.SetStateAction<{ key: string; direction: 'asc' | 'desc' } | null>>
    page: number
    setInternalPage: React.Dispatch<React.SetStateAction<number>>
    pageSize: number
    setPageSize: React.Dispatch<React.SetStateAction<number>>
    searchTerm: string
    setSearchTerm: (value: string) => void
    showColumnSelector: boolean
    setShowColumnSelector: (value: boolean) => void
    visibleColumns: Array<Column<T> & { visible: boolean }>
    totalItems: number
    totalPages: number
    paginatedData: T[]
    allPageSelected: boolean
}

export interface DataTableBaseProps {
    onPageChange?: (page: number) => void
    onPageSizeChange?: (size: number) => void
    onSelectionChange?: (selectedIds: Set<number | string>) => void
    onSort?: (key: string, direction: 'asc' | 'desc') => void
    selectedIds: Set<number | string>
    sortable: boolean
}
