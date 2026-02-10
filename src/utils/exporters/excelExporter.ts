/**
 * Excel Export Utility
 * Generates XLSX files using a simple CSV-based approach (no external dependencies)
 * For more complex Excel files, consider using ExcelJS or SheetJS
 */

import { centsToShillings } from '../format'

export interface ExcelColumn {
    key: string
    header: string
    width?: number
    format?: 'text' | 'number' | 'currency' | 'date' | 'percent'
}

export interface ExcelExportOptions {
    filename: string
    sheetName?: string
    title?: string
    subtitle?: string
    columns: ExcelColumn[]
    data: Record<string, unknown>[]
    includeTimestamp?: boolean
}

/**
 * Export data to CSV format (can be opened in Excel)
 */
export function exportToCSV(options: ExcelExportOptions): string {
    const { columns, data, title, subtitle, includeTimestamp = true } = options

    const lines: string[] = []

    // Add title if provided
    if (title) {
        lines.push(escapeCSV(title))
    }
    if (subtitle) {
        lines.push(escapeCSV(subtitle))
    }
    if (title || subtitle) {
        lines.push('') // Empty line after headers
    }

    // Add timestamp
    if (includeTimestamp) {
        lines.push(`Generated: ${new Date().toLocaleString()}`)
        lines.push('')
    }

    // Add column headers
    lines.push(columns.map(col => escapeCSV(col.header)).join(','))

    // Add data rows
    for (const row of data) {
        const values = columns.map(col => {
            const value = row[col.key]
            return formatValue(value, col.format)
        })
        lines.push(values.join(','))
    }

    return lines.join('\n')
}

/**
 * Trigger CSV download in the browser
 */
export function downloadCSV(options: ExcelExportOptions): void {
    const csv = exportToCSV(options)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${options.filename}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function escapeCSV(value: unknown): string {
    if (value === null || value === undefined) {return ''}
    const str = String(value)
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

function formatValue(value: unknown, format?: ExcelColumn['format']): string {
    if (value === null || value === undefined) {return ''}

    switch (format) {
        case 'currency': {
            const amount = centsToShillings(value as number)
            return escapeCSV(amount.toFixed(2))
        }
        case 'number':
            return escapeCSV(Number(value).toLocaleString())
        case 'percent':
            return escapeCSV(`${Number(value).toFixed(1)}%`)
        case 'date':
            return escapeCSV(new Date(value as string).toLocaleDateString())
        default:
            return escapeCSV(value)
    }
}
