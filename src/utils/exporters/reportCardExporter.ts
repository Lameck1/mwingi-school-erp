import type { ReportCardData } from '../../types/electron-api/ReportsAPI'
import type { jsPDF } from 'jspdf'

export async function generateReportCardPDF(data: ReportCardData): Promise<jsPDF> {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let y = 15
    const marginX = 14
    const bottomMargin = 20

    // Helper: Print Header on new pages
    const printHeader = (isFirstPage = false) => {
        if (!isFirstPage) {
            doc.addPage()
            y = 15
        }

        // --- Header Section ---
        let headerY = y
        // Logo
        if (data.school?.logo) {
            try {
                doc.addImage(data.school.logo, 'PNG', pageWidth / 2 - 10, headerY, 20, 20)
                headerY += 24
            } catch (e) {
                console.error('Failed to add logo', e)
                headerY += 5
            }
        } else {
            headerY += 5
        }

        const schoolName = data.school?.name || 'MWINGI ADVENTIST SCHOOL'
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(schoolName.toUpperCase(), pageWidth / 2, headerY, { align: 'center' })
        headerY += 6

        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        if (data.school?.motto) {
            doc.setFont('times', 'italic')
            doc.text(`"${data.school.motto}"`, pageWidth / 2, headerY, { align: 'center' })
            doc.setFont('helvetica', 'normal')
            headerY += 5
        }

        const address = data.school?.address || 'P.O. Box 123, Mwingi, Kenya'
        const phone = data.school?.phone || '+254 700 000 000'
        doc.text(`${address} | Tel: ${phone}`, pageWidth / 2, headerY, { align: 'center' })
        headerY += 4
        const email = data.school?.email || 'info@mwingiadventist.ac.ke'
        doc.text(`Email: ${email}`, pageWidth / 2, headerY, { align: 'center' })
        headerY += 8

        // --- Title Bar ---
        doc.setFillColor(30, 58, 138) // Navy blue
        doc.rect(marginX, headerY, pageWidth - 28, 7, 'F')
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.text(isFirstPage ? 'STUDENT REPORT CARD' : 'STUDENT REPORT CARD (Cont.)', pageWidth / 2, headerY + 5, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        headerY += 12

        if (isFirstPage) {
            // --- Student Details & Photo ---
            const photoSize = 25
            const infoX = marginX

            // Photo
            if (data.student.photo) {
                try {
                    doc.setDrawColor(200, 200, 200)
                    doc.rect(pageWidth - marginX - photoSize, headerY, photoSize, photoSize * 1.25)
                    doc.addImage(data.student.photo, 'PNG', pageWidth - marginX - photoSize, headerY, photoSize, photoSize * 1.25)
                } catch (e) { console.error('Failed to add photo', e) }
            }

            doc.setFontSize(9)
            const labelX = infoX
            const valX = infoX + 22
            const col2LabelX = infoX + 80
            const col2ValX = col2LabelX + 22

            // Row 1
            doc.setFont('helvetica', 'bold')
            doc.text('NAME:', labelX, headerY + 4)
            doc.setFont('helvetica', 'normal')
            doc.text(`${data.student.first_name} ${data.student.last_name}`.toUpperCase(), valX, headerY + 4)

            doc.setFont('helvetica', 'bold')
            doc.text('ADM NO:', col2LabelX, headerY + 4)
            doc.setFont('helvetica', 'normal')
            doc.text(data.student.admission_number, col2ValX, headerY + 4)

            // Row 2
            doc.setFont('helvetica', 'bold')
            doc.text('CLASS:', labelX, headerY + 10)
            doc.setFont('helvetica', 'normal')
            doc.text(data.student.stream_name || '-', valX, headerY + 10)

            // Row 3
            doc.setFont('helvetica', 'bold')
            doc.text('TERM:', labelX, headerY + 16)
            doc.setFont('helvetica', 'normal')
            doc.text(`${data.term} ${data.academic_year}`, valX, headerY + 16)

            headerY += 35
        } else {
            // Simplified header for continuation pages
            doc.setFontSize(9)
            doc.setFont('helvetica', 'bold')
            doc.text(`NAME: ${data.student.first_name} ${data.student.last_name}`, marginX, headerY + 5)
            doc.text(`ADM NO: ${data.student.admission_number}`, pageWidth - marginX - 40, headerY + 5)
            headerY += 10
        }

        y = headerY
        return y
    }

    // Initial Header
    printHeader(true)

    // --- Academic Performance Table ---
    if (data.grades.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('ACADEMIC PERFORMANCE', marginX, y)
        y += 4

        // Adjusted column widths for dynamic remarks
        // Subject | CAT1 | CAT2 | MID | END | AVG | GRADE | REMARKS (Dynamic)
        const colWidths = [45, 11, 11, 11, 11, 11, 13] // Fixed columns
        const fixedWidthSum = colWidths.reduce((a, b) => a + b, 0)
        const remarksWidth = pageWidth - (marginX * 2) - fixedWidthSum

        const headers = ['SUBJECT', 'CAT 1', 'CAT 2', 'MID', 'END', 'AVG', 'GRADE', 'REMARKS']

        const drawTableHeader = () => {
            doc.setFillColor(30, 58, 138)
            doc.rect(marginX, y, pageWidth - (marginX * 2), 7, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')

            let x = marginX + 2
            colWidths.forEach((w, i) => {
                doc.text(headers[i], x, y + 4.5)
                x += w
            })
            doc.text(headers[7], x, y + 4.5) // Remarks header

            y += 7
            doc.setTextColor(0, 0, 0)
        }

        drawTableHeader()

        // Calculate Totals per Column
        const totals = { cat1: 0, cat2: 0, mid: 0, end: 0, avg: 0, count: 0 }

        // Table Rows
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)

        data.grades.forEach((grade, idx) => {
            // Accumulate totals
            if (grade.cat1) {totals.cat1 += grade.cat1}
            if (grade.cat2) {totals.cat2 += grade.cat2}
            if (grade.midterm) {totals.mid += grade.midterm}
            if (grade.final_exam) {totals.end += grade.final_exam}
            totals.avg += grade.average
            totals.count++

            // Text Wrapping Logic
            const remarksText = grade.remarks || '-'
            const splitRemarks = doc.splitTextToSize(remarksText, remarksWidth - 4) // -4 for padding
            const lines = splitRemarks.length
            const lineHeight = 4
            const rowHeight = Math.max(7, lines * lineHeight + 3) // +3 for padding

            // Page Break Check
            if (y + rowHeight > pageHeight - bottomMargin) {
                printHeader(false)
                drawTableHeader()
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
            }

            // Zebra striping
            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252)
                doc.rect(marginX, y, pageWidth - (marginX * 2), rowHeight, 'F')
            }

            let x = marginX + 2
            const row = [
                grade.subject_name.substring(0, 28),
                grade.cat1?.toString() || '-',
                grade.cat2?.toString() || '-',
                grade.midterm?.toString() || '-',
                grade.final_exam?.toString() || '-',
                grade.average.toFixed(0),
                grade.grade_letter,
            ]

            // Draw Fixed Columns
            row.forEach((cell, i) => {
                if (i === 6) {doc.setFont('helvetica', 'bold')}
                else {doc.setFont('helvetica', 'normal')}

                doc.text(cell, x, y + 4.5)
                x += colWidths[i]
            })

            // Draw Wrapped Remarks
            doc.setFont('helvetica', 'normal')
            doc.text(splitRemarks, x, y + 4.5)

            y += rowHeight
        })

        // Totals Row
        const totalsHeight = 14
        if (y + totalsHeight > pageHeight - bottomMargin) {
            printHeader(false)
            drawTableHeader()
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
        }

        y += 1
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.1)
        doc.line(marginX, y, pageWidth - marginX, y) // Top line

        doc.setFont('helvetica', 'bold')
        doc.text('TOTALS:', marginX + 2, y + 5)

        // Draw totals aligned with columns
        let tx = marginX + 2 + colWidths[0] // Start at CAT1 column
        doc.text(totals.cat1 > 0 ? totals.cat1.toString() : '-', tx, y + 5)
        tx += colWidths[1]
        doc.text(totals.cat2 > 0 ? totals.cat2.toString() : '-', tx, y + 5)
        tx += colWidths[2]
        doc.text(totals.mid > 0 ? totals.mid.toString() : '-', tx, y + 5)
        tx += colWidths[3]
        doc.text(totals.end > 0 ? totals.end.toString() : '-', tx, y + 5)
        tx += colWidths[4]
        doc.text(totals.avg > 0 ? totals.avg.toFixed(0) : '-', tx, y + 5)

        y += 7

        // Averages Row
        doc.text('AVERAGES:', marginX + 2, y + 5)
        tx = marginX + 2 + colWidths[0]
        const cnt = totals.count || 1
        doc.text(totals.cat1 > 0 ? (totals.cat1 / cnt).toFixed(0) : '-', tx, y + 5)
        tx += colWidths[1]
        doc.text(totals.cat2 > 0 ? (totals.cat2 / cnt).toFixed(0) : '-', tx, y + 5)
        tx += colWidths[2]
        doc.text(totals.mid > 0 ? (totals.mid / cnt).toFixed(0) : '-', tx, y + 5)
        tx += colWidths[3]
        doc.text(totals.end > 0 ? (totals.end / cnt).toFixed(0) : '-', tx, y + 5)
        tx += colWidths[4]
        doc.text(totals.avg > 0 ? (totals.avg / cnt).toFixed(0) : '-', tx, y + 5)

        y += 7
        doc.line(marginX, y, pageWidth - marginX, y) // Bottom line
    }

    y += 10

    // --- Summary & Footer Section (Protected Block) ---
    // Calculate required height for summary + remarks + signatures ~ 80-90mm
    const requiredBottomSpace = 90
    if (y + requiredBottomSpace > pageHeight - bottomMargin) {
        doc.addPage()
        y = 20 // Margin on new page
    }

    // --- Summary Frame ---
    doc.setDrawColor(200, 200, 200)
    doc.roundedRect(marginX, y, pageWidth - (marginX * 2), 20, 2, 2)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('OVERALL SUMMARY', marginX + 4, y + 6)

    doc.setFont('helvetica', 'normal')
    const sumY = y + 14
    doc.text(`Total Marks: ${data.summary.total_marks}`, marginX + 4, sumY)
    doc.text(`Mean Score: ${data.summary.average}%`, marginX + 60, sumY)
    doc.text(`Mean Grade: ${data.summary.grade}`, marginX + 110, sumY)
    if (data.summary.position) {
        doc.text(`Position: ${data.summary.position} / ${data.summary.class_size}`, marginX + 150, sumY)
    }

    y += 28

    // --- Remarks ---
    // Teacher
    doc.setFont('helvetica', 'bold')
    doc.text("CLASS TEACHER'S REMARKS:", marginX, y)
    y += 4
    doc.setDrawColor(220, 220, 220)
    doc.rect(marginX, y, pageWidth - (marginX * 2), 12) // Box
    doc.setFont('helvetica', 'normal')
    doc.text(data.summary.teacher_remarks, marginX + 2, y + 7, { maxWidth: pageWidth - 32 })
    y += 18

    // Principal
    doc.setFont('helvetica', 'bold')
    doc.text("PRINCIPAL'S REMARKS:", marginX, y)
    y += 4
    doc.rect(marginX, y, pageWidth - (marginX * 2), 12) // Box
    doc.setFont('helvetica', 'normal')
    doc.text(data.summary.principal_remarks || 'Diligent work is noted.', marginX + 2, y + 7, { maxWidth: pageWidth - 32 })
    y += 18

    // --- Footer (Legend & Signatures) ---
    let footerStart = y + 5

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.1)
    doc.line(marginX, footerStart, pageWidth - marginX, footerStart)
    footerStart += 5

    // Legend
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('KEY:', marginX, footerStart)
    doc.setFont('helvetica', 'normal')

    const isCBC = data.grades.some(g => ['EE', 'ME', 'AE', 'BE'].some(p => g.grade_letter.startsWith(p)))
    if (isCBC) {
        doc.text('EE: Exceeding Exp (75-100)  |  ME: Meeting Exp (50-74)  |  AE: Approaching Exp (25-49)  |  BE: Below Exp (0-24)', marginX + 10, footerStart)
    } else {
        doc.text('A: Excellent (80-100) | B: Good (60-79) | C: Average (50-59) | D: Fair (40-49) | E: Poor (0-39)', marginX + 10, footerStart)
    }

    // Signatures
    const sigY = footerStart + 15

    doc.setDrawColor(0, 0, 0)
    doc.line(marginX, sigY, marginX + 60, sigY)
    doc.line(pageWidth - marginX - 60, sigY, pageWidth - marginX, sigY)

    doc.setFont('helvetica', 'bold')
    doc.text('Class Teacher Signature', marginX, sigY + 4)
    doc.text('Principal Signature', pageWidth - marginX - 60, sigY + 4)

    return doc
}
