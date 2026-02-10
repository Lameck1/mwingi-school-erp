/**
 * PDF Export Utility
 * Uses jsPDF (lazy loaded) for generating professional PDF reports
 */

import { formatCurrencyFromCents } from '../format'

import type { jsPDF } from 'jspdf'

export interface PDFColumn {
    key: string
    header: string
    width?: number
    align?: 'left' | 'center' | 'right'
    format?: 'text' | 'number' | 'currency' | 'date'
}

export interface PDFExportOptions {
    filename: string
    title: string
    subtitle?: string
    columns: PDFColumn[]
    data: Record<string, unknown>[]
    orientation?: 'portrait' | 'landscape'
    schoolInfo?: {
        name: string
        address?: string
        phone?: string
        email?: string
    }
    footerText?: string
    showPageNumbers?: boolean
}

export async function exportToPDF(options: PDFExportOptions): Promise<void> {
    const { default: jsPDF } = await import('jspdf')
    const {
        filename,
        title,
        subtitle,
        columns,
        data,
        orientation = 'portrait',
        schoolInfo,
        footerText,
        showPageNumbers = true
    } = options

    const doc = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4'
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)

    let yPosition = margin

    // School Header
    if (schoolInfo) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.text(schoolInfo.name, pageWidth / 2, yPosition, { align: 'center' })
        yPosition += 6

        if (schoolInfo.address) {
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.text(schoolInfo.address, pageWidth / 2, yPosition, { align: 'center' })
            yPosition += 4
        }

        if (schoolInfo.phone || schoolInfo.email) {
            const contact = [schoolInfo.phone, schoolInfo.email].filter(Boolean).join(' | ')
            doc.setFontSize(8)
            doc.text(contact, pageWidth / 2, yPosition, { align: 'center' })
            yPosition += 4
        }

        // Divider line
        yPosition += 2
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, yPosition, pageWidth - margin, yPosition)
        yPosition += 8
    }

    // Report Title
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(title, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 6

    if (subtitle) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' })
        yPosition += 6
    }

    // Generated date
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10
    doc.setTextColor(0, 0, 0)

    // Calculate column widths
    const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0)
    const remainingColumns = columns.filter(col => !col.width).length
    const defaultWidth = remainingColumns > 0
        ? (contentWidth - totalDefinedWidth) / remainingColumns
        : contentWidth / columns.length

    const columnWidths = columns.map(col => col.width || defaultWidth)

    // Table Header
    doc.setFillColor(45, 55, 72) // Dark blue-gray
    doc.rect(margin, yPosition, contentWidth, 8, 'F')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)

    let xPosition = margin + 2
    columns.forEach((col, i) => {
        doc.text(col.header, xPosition, yPosition + 5.5)
        xPosition += columnWidths[i]
    })
    yPosition += 10
    doc.setTextColor(0, 0, 0)

    // Table Rows
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')

    const rowHeight = 7
    let isAlternate = false

    for (const row of data) {
        // Check for page break
        if (yPosition + rowHeight > pageHeight - 20) {
            // Add page number to current page
            if (showPageNumbers) {
                addPageNumber(doc, pageWidth, pageHeight)
            }

            doc.addPage()
            yPosition = margin

            // Re-add table header on new page
            doc.setFillColor(45, 55, 72)
            doc.rect(margin, yPosition, contentWidth, 8, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(255, 255, 255)

            xPosition = margin + 2
            columns.forEach((col, i) => {
                doc.text(col.header, xPosition, yPosition + 5.5)
                xPosition += columnWidths[i]
            })
            yPosition += 10
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'normal')
            isAlternate = false
        }

        // Alternate row background
        if (isAlternate) {
            doc.setFillColor(248, 250, 252)
            doc.rect(margin, yPosition, contentWidth, rowHeight, 'F')
        }
        isAlternate = !isAlternate

        // Row border
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, yPosition + rowHeight, pageWidth - margin, yPosition + rowHeight)

        // Cell values
        xPosition = margin + 2
        columns.forEach((col, i) => {
            const value = formatValue(row[col.key], col.format)
            let textX = xPosition
            if (col.align === 'right') {
                textX = xPosition + columnWidths[i] - 4
            } else if (col.align === 'center') {
                textX = xPosition + columnWidths[i] / 2
            }

            doc.text(value, textX, yPosition + 5, {
                align: col.align || 'left',
                maxWidth: columnWidths[i] - 4
            })
            xPosition += columnWidths[i]
        })

        yPosition += rowHeight
    }

    // Footer
    if (footerText) {
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(footerText, margin, pageHeight - 10)
    }

    // Page number on last page
    if (showPageNumbers) {
        addPageNumber(doc, pageWidth, pageHeight)
    }

    // Save
    doc.save(`${filename}.pdf`)
}

function addPageNumber(doc: jsPDF, pageWidth: number, pageHeight: number): void {
    const pageCount = doc.getNumberOfPages()
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
        `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
    )
}

function formatValue(value: unknown, format?: PDFColumn['format']): string {
    if (value === null || value === undefined) {return '-'}

    switch (format) {
        case 'currency':
            return formatCurrencyFromCents(Number(value))
        case 'number':
            return Number(value).toLocaleString()
        case 'date':
            return new Date(value as string).toLocaleDateString()
        default:
            return String(value)
    }
}
