import { useToast } from '../../contexts/ToastContext'
import { exportToPDF, downloadCSV } from '../../utils/exporters'

import { type useReportsData } from './useReportsData'

type ReportsData = ReturnType<typeof useReportsData>

const SCHOOL_INFO = {
    name: 'Mwingi Adventist School',
    address: 'P.O. Box 123, Mwingi, Kenya',
    phone: '+254 700 000 000',
}

export function useReportsExport(data: ReportsData) {
    const { showToast } = useToast()

    const handleExportPDF = async () => {
        const { activeTab, defaulters, financialSummary, dailyCollections, dateRange, selectedDate } = data

        if (activeTab === 'defaulters' && defaulters.length > 0) {
            await exportToPDF({
                filename: `fee-defaulters-${new Date().toISOString().slice(0, 10)}`,
                title: 'Fee Defaulters Report',
                subtitle: `Period: ${dateRange.start} to ${dateRange.end}`,
                schoolInfo: SCHOOL_INFO,
                columns: [
                    { key: 'admission_number', header: 'Adm No', width: 25 },
                    { key: 'student_name', header: 'Student Name', width: 45 },
                    { key: 'stream_name', header: 'Grade', width: 25 },
                    { key: 'total_amount', header: 'Total Fees', width: 30, align: 'right', format: 'currency' },
                    { key: 'amount_paid', header: 'Paid', width: 30, align: 'right', format: 'currency' },
                    { key: 'balance', header: 'Balance', width: 30, align: 'right', format: 'currency' },
                ],
                data: defaulters.map((d) => ({ ...d, student_name: `${d.first_name} ${d.last_name}` })),
            })
            return
        }

        if (activeTab === 'financial' && financialSummary) {
            await exportToPDF({
                filename: `financial-summary-${new Date().toISOString().slice(0, 10)}`,
                title: 'Financial Summary Report',
                subtitle: `Period: ${dateRange.start} to ${dateRange.end}`,
                schoolInfo: SCHOOL_INFO,
                columns: [
                    { key: 'category', header: 'Category', width: 80 },
                    { key: 'amount', header: 'Amount', width: 60, align: 'right', format: 'currency' },
                ],
                data: [
                    { category: 'Total Income', amount: financialSummary.totalIncome },
                    { category: 'Total Expenses', amount: financialSummary.totalExpense },
                    { category: 'Net Balance', amount: financialSummary.netBalance },
                ],
            })
            return
        }

        if (activeTab === 'daily-collection' && dailyCollections.length > 0) {
            await exportToPDF({
                filename: `daily-collection-${selectedDate}`,
                title: 'Daily Collection Report',
                subtitle: `Date: ${selectedDate}`,
                schoolInfo: SCHOOL_INFO,
                columns: [
                    { key: 'admission_number', header: 'Adm No', width: 25 },
                    { key: 'student_name', header: 'Student Name', width: 45 },
                    { key: 'stream_name', header: 'Grade', width: 25 },
                    { key: 'amount', header: 'Amount', width: 30, align: 'right', format: 'currency' },
                    { key: 'payment_method', header: 'Method', width: 30 },
                ],
                data: dailyCollections.map((d) => ({ ...d, student_name: d.student_name || 'N/A' })),
            })
            return
        }

        showToast('Please select a report with data to export', 'warning')
    }

    const handleExportCSV = () => {
        const { activeTab, defaulters, financialSummary, dailyCollections, selectedDate } = data

        if (activeTab === 'defaulters' && defaulters.length > 0) {
            downloadCSV({
                filename: `fee-defaulters-${new Date().toISOString().slice(0, 10)}`,
                title: 'Fee Defaulters Report',
                columns: [
                    { key: 'admission_number', header: 'Admission Number' },
                    { key: 'student_name', header: 'Student Name' },
                    { key: 'stream_name', header: 'Grade' },
                    { key: 'total_amount', header: 'Total Fees', format: 'currency' },
                    { key: 'amount_paid', header: 'Paid', format: 'currency' },
                    { key: 'balance', header: 'Balance', format: 'currency' },
                ],
                data: defaulters.map((d) => ({ ...d, student_name: `${d.first_name} ${d.last_name}` })),
            })
            return
        }

        if (activeTab === 'financial' && financialSummary) {
            downloadCSV({
                filename: `financial-summary-${new Date().toISOString().slice(0, 10)}`,
                title: 'Financial Summary Report',
                columns: [
                    { key: 'category', header: 'Category' },
                    { key: 'amount', header: 'Amount', format: 'currency' },
                ],
                data: [
                    { category: 'Total Income', amount: financialSummary.totalIncome },
                    { category: 'Total Expenses', amount: financialSummary.totalExpense },
                    { category: 'Net Balance', amount: financialSummary.netBalance },
                ],
            })
            return
        }

        if (activeTab === 'daily-collection' && dailyCollections.length > 0) {
            downloadCSV({
                filename: `daily-collection-${selectedDate}`,
                title: 'Daily Collection Report',
                columns: [
                    { key: 'date', header: 'Date' },
                    { key: 'student_name', header: 'Student Name' },
                    { key: 'payment_method', header: 'Method' },
                    { key: 'payment_reference', header: 'Reference' },
                    { key: 'amount', header: 'Amount', format: 'currency' },
                ],
                data: dailyCollections.map((item) => ({ ...item } as Record<string, unknown>)),
            })
            return
        }

        showToast('Please select a report with data to export', 'warning')
    }

    return { handleExportPDF, handleExportCSV } as const
}
