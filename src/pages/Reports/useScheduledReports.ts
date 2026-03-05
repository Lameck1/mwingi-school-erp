import { useState, useEffect, useCallback, useMemo } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

import type { ScheduledReport } from '../../types/electron-api/ReportsAPI'

export function useScheduledReports() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    const [schedules, setSchedules] = useState<ScheduledReport[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showModal, setShowModal] = useState(false)

    const [editingSchedule, setEditingSchedule] = useState<Partial<ScheduledReport>>({
        schedule_type: 'WEEKLY',
        day_of_week: 1,
        time_of_day: '08:00',
        recipients: JSON.stringify([]),
        is_active: true,
        report_type: 'FEE_COLLECTION'
    })

    const [recipientInput, setRecipientInput] = useState('')

    const loadSchedules = useCallback(async () => {
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.reports.getScheduledReports()
            setSchedules(unwrapArrayResult(data, 'Failed to load scheduled reports'))
        } catch (error) {
            console.error('Failed to load schedules:', error)
            setSchedules([])
            showToast(error instanceof Error ? error.message : 'Failed to load schedules', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        void loadSchedules()
    }, [loadSchedules])

    const getRecipients = useMemo((): string[] => {
        try {
            return JSON.parse(editingSchedule.recipients || '[]')
        } catch {
            return []
        }
    }, [editingSchedule.recipients])

    const handleSave = async () => {
        if (!user?.id) {
            showToast('You must be signed in to save schedules', 'error')
            return
        }
        if (!editingSchedule.report_name) {
            showToast('Report name is required', 'error')
            return
        }
        if (getRecipients.length === 0) {
            showToast('Add at least one recipient email', 'error')
            return
        }

        setSaving(true)
        try {
            if (editingSchedule.id) {
                unwrapIPCResult(
                    await globalThis.electronAPI.reports.updateScheduledReport(editingSchedule.id, editingSchedule, user.id),
                    'Failed to update scheduled report'
                )
            } else {
                unwrapIPCResult(
                    await globalThis.electronAPI.reports.createScheduledReport(editingSchedule, user.id),
                    'Failed to create scheduled report'
                )
            }
            setShowModal(false)
            await loadSchedules()
            showToast('Schedule saved successfully', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to save schedule', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this schedule?')) { return }
        if (!user?.id) {
            showToast('You must be signed in to delete schedules', 'error')
            return
        }

        try {
            unwrapIPCResult(
                await globalThis.electronAPI.reports.deleteScheduledReport(id, user.id),
                'Failed to delete scheduled report'
            )
            await loadSchedules()
            showToast('Schedule deleted successfully', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to delete schedule', 'error')
        }
    }

    const addRecipient = () => {
        const candidate = recipientInput.trim()
        if (!candidate.includes('@')) {
            showToast('Enter a valid recipient email address', 'warning')
            return
        }
        const current = getRecipients
        if (current.includes(candidate)) {
            showToast('Recipient already added', 'warning')
            return
        }
        setEditingSchedule({
            ...editingSchedule,
            recipients: JSON.stringify([...current, candidate])
        })
        setRecipientInput('')
    }

    const removeRecipient = (email: string) => {
        const current = getRecipients
        setEditingSchedule({
            ...editingSchedule,
            recipients: JSON.stringify(current.filter((e: string) => e !== email))
        })
    }

    const openNewSchedule = () => {
        setEditingSchedule({
            schedule_type: 'WEEKLY',
            day_of_week: 1,
            time_of_day: '08:00',
            recipients: JSON.stringify([]),
            is_active: true,
            report_type: 'FEE_COLLECTION'
        })
        setShowModal(true)
    }

    const openEditSchedule = (schedule: ScheduledReport) => {
        setEditingSchedule(schedule)
        setShowModal(true)
    }

    const closeModal = () => setShowModal(false)

    return {
        schedules,
        loading,
        saving,
        showModal,
        editingSchedule,
        recipientInput,
        getRecipients,
        setEditingSchedule,
        setRecipientInput,
        handleSave,
        handleDelete,
        addRecipient,
        removeRecipient,
        openNewSchedule,
        openEditSchedule,
        closeModal,
    }
}
