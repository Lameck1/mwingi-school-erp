import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

import { useToast } from '../../contexts/ToastContext'
import { useScrollableTabNav } from '../../hooks/useScrollableTabNav'
import { useAuthStore } from '../../stores'
import { formatCurrencyFromCents } from '../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

import {
    type TabId,
    type StudentStats,
    type FinancialSummary,
    type Defaulter,
    type DailyCollectionItem,
    type DateRange,
    isFinancialSummary,
} from './types'

export function useReportsData() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()
    const location = useLocation()

    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState<DateRange>({
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
    })

    const [studentStats, setStudentStats] = useState<StudentStats | null>(null)
    const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
    const [feeCollectionData, setFeeCollectionData] = useState<{ month: string; amount: number }[]>([])
    const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([])
    const [defaulters, setDefaulters] = useState<Defaulter[]>([])
    const [dailyCollections, setDailyCollections] = useState<DailyCollectionItem[]>([])
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
    const [sendingBulk, setSendingBulk] = useState(false)
    const [activeTab, setActiveTab] = useState<TabId>('fee-collection')

    const stableSetActiveTab = useCallback((tab: TabId) => setActiveTab(tab), [])
    const { navRef, handleTabClick } = useScrollableTabNav(stableSetActiveTab)

    // ── Data loading ──────────────────────────────────────────

    const loadReportData = useCallback(async () => {
        setLoading(true)
        try {
            const studentsResult = unwrapIPCResult<{ rows: Array<{ student_type?: string }>; totalCount: number }>(
                await globalThis.electronAPI.students.getStudents({ pageSize: 200 }),
                'Failed to load students',
            )
            const dayScholars = studentsResult.rows.filter((s) => s.student_type === 'DAY_SCHOLAR').length
            const boarders = studentsResult.rows.filter((s) => s.student_type === 'BOARDER').length
            setStudentStats({ totalStudents: studentsResult.totalCount, dayScholars, boarders })

            const summaryRaw = unwrapIPCResult(
                await globalThis.electronAPI.finance.getTransactionSummary(dateRange.start, dateRange.end),
                'Failed to load financial summary',
            )
            if (!isFinancialSummary(summaryRaw)) {
                throw new Error('Invalid financial summary payload')
            }
            setFinancialSummary(summaryRaw)

            const currentFeeData = unwrapArrayResult(
                await globalThis.electronAPI.reports.getFeeCollectionReport(dateRange.start, dateRange.end),
                'Failed to load fee collection data',
            )

            const monthlyData: Record<string, number> = {}
            for (const item of currentFeeData) {
                if (!item.payment_date) { continue }
                const d = new Date(item.payment_date)
                if (Number.isNaN(d.getTime())) { continue }
                const month = d.toLocaleDateString('en-US', { month: 'short' })
                monthlyData[month] = (monthlyData[month] || 0) + item.amount
            }
            setFeeCollectionData(
                Object.entries(monthlyData).length > 0
                    ? Object.entries(monthlyData).map(([month, amount]) => ({ month, amount }))
                    : [],
            )

            const methodData: Record<string, number> = {}
            for (const item of currentFeeData) {
                const method = item.payment_method || 'Other'
                methodData[method] = (methodData[method] || 0) + item.amount
            }
            const total = Object.values(methodData).reduce((sum, v) => sum + v, 0) || 0
            setPaymentMethodData(
                total > 0
                    ? Object.entries(methodData).map(([name, value]) => ({
                          name,
                          value: Math.round((value / total) * 100),
                      }))
                    : [],
            )

            setDefaulters(unwrapArrayResult(await globalThis.electronAPI.reports.getDefaulters(), 'Failed to load defaulters report'))
            setDailyCollections(unwrapArrayResult(await globalThis.electronAPI.reports.getDailyCollection(selectedDate), 'Failed to load daily collection report'))
        } catch (error) {
            console.error('Failed to load report data:', error)
            setStudentStats(null)
            setFinancialSummary(null)
            setFeeCollectionData([])
            setPaymentMethodData([])
            setDefaulters([])
            setDailyCollections([])
            showToast(error instanceof Error ? error.message : 'Failed to load report data', 'error')
        } finally {
            setLoading(false)
        }
    }, [dateRange.end, dateRange.start, selectedDate, showToast])

    useEffect(() => { void loadReportData() }, [loadReportData])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const tab = params.get('tab') as TabId | null
        if (tab === 'fee-collection' || tab === 'defaulters' || tab === 'daily-collection' || tab === 'students' || tab === 'financial' || tab === 'scheduled') {
            setActiveTab(tab)
        }
    }, [location.search])

    // ── SMS handlers ──────────────────────────────────────────

    const handleSendReminder = async (student: Defaulter) => {
        if (!student.guardian_phone) {
            showToast('Guardian phone number missing', 'warning')
            return
        }
        if (!user?.id) {
            showToast('You must be signed in to send reminders', 'error')
            return
        }
        try {
            const message = `Fee Reminder: ${student.first_name} has an outstanding balance of ${formatCurrencyFromCents(student.balance)}. Please settle at your earliest convenience. Thank you.`
            const result = await globalThis.electronAPI.communications.sendSMS({
                to: student.guardian_phone,
                message,
                recipientId: Number(student.id),
                recipientType: 'STUDENT',
                userId: user.id,
            })
            if (result.success) {
                showToast(`Reminder sent to ${student.first_name}'s guardian`, 'success')
            } else {
                showToast(`Failed to send: ${result.error || 'Unknown SMS error'}`, 'error')
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error sending reminder', 'error')
        }
    }

    const handleBulkReminders = async () => {
        if (!confirm(`Send reminders to ${defaulters.length} guardians?`)) { return }
        if (!user?.id) {
            showToast('You must be signed in to send reminders', 'error')
            return
        }
        setSendingBulk(true)
        let sentCount = 0
        let failedCount = 0
        for (const student of defaulters) {
            if (!student.guardian_phone) { failedCount++; continue }
            try {
                const message = `Fee Reminder: ${student.first_name} has an outstanding balance of ${formatCurrencyFromCents(student.balance)}. Please settle at your earliest convenience. Thank you.`
                const result = await globalThis.electronAPI.communications.sendSMS({
                    to: student.guardian_phone,
                    message,
                    recipientId: Number(student.id),
                    recipientType: 'STUDENT',
                    userId: user.id,
                })
                if (result.success) { sentCount++ } else { failedCount++ }
            } catch { failedCount++ }
        }
        setSendingBulk(false)
        showToast(`Reminder dispatch complete: ${sentCount} sent, ${failedCount} failed`, failedCount === 0 ? 'success' : 'warning')
    }

    return {
        loading,
        dateRange, setDateRange,
        studentStats, financialSummary,
        feeCollectionData, paymentMethodData,
        defaulters, dailyCollections,
        selectedDate, setSelectedDate,
        sendingBulk,
        activeTab, navRef, handleTabClick,
        loadReportData,
        handleSendReminder, handleBulkReminders,
    } as const
}
