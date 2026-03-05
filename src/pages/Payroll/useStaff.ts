import { useEffect, useState, useCallback } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { type StaffMember } from '../../types/electron-api/StaffAPI'
import { centsToShillings, shillingsToCents } from '../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

export type StaffFormState = {
    staff_number: string
    first_name: string
    middle_name: string
    last_name: string
    phone: string
    email: string
    department: string
    job_title: string
    employment_date: string
    basic_salary: string
    is_active: boolean
}

const EMPTY_FORM: StaffFormState = {
    staff_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    phone: '',
    email: '',
    department: '',
    job_title: '',
    employment_date: '',
    basic_salary: '',
    is_active: true
}

export function useStaff() {
    const { showToast } = useToast()
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<StaffMember | null>(null)
    const [form, setForm] = useState<StaffFormState>({ ...EMPTY_FORM })

    const loadStaff = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.staff.getStaff(false)
            setStaff(unwrapArrayResult(data, 'Failed to load staff records'))
        } catch (error) {
            console.error('Failed to load staff:', error)
            setStaff([])
            showToast(error instanceof Error ? error.message : 'Failed to synchronize staff directory', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { loadStaff().catch((err: unknown) => console.error('Failed to load staff', err)) }, [loadStaff])

    const resetForm = () => {
        setEditing(null)
        setForm({ ...EMPTY_FORM })
    }

    const openCreate = () => {
        resetForm()
        setShowModal(true)
    }

    const openEdit = (member: StaffMember) => {
        setEditing(member)
        setForm({
            staff_number: member.staff_number || '',
            first_name: member.first_name || '',
            middle_name: member.middle_name || '',
            last_name: member.last_name || '',
            phone: member.phone || '',
            email: member.email || '',
            department: member.department || '',
            job_title: member.job_title || '',
            employment_date: member.employment_date || '',
            basic_salary: String(centsToShillings(member.basic_salary || 0)),
            is_active: Boolean(member.is_active)
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.staff_number.trim() || !form.first_name.trim() || !form.last_name.trim()) {
            showToast('Staff number, first name, and last name are required', 'error')
            return
        }
        setSaving(true)
        try {
            const payload = {
                staff_number: form.staff_number.trim(),
                first_name: form.first_name.trim(),
                middle_name: form.middle_name.trim() || undefined,
                last_name: form.last_name.trim(),
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                department: form.department.trim() || undefined,
                job_title: form.job_title.trim() || undefined,
                employment_date: form.employment_date || undefined,
                basic_salary: shillingsToCents(form.basic_salary || 0),
                is_active: form.is_active
            }

            if (editing) {
                unwrapIPCResult(
                    await globalThis.electronAPI.staff.updateStaff(editing.id, payload),
                    'Failed to update staff record'
                )
                showToast('Staff record updated', 'success')
            } else {
                unwrapIPCResult(
                    await globalThis.electronAPI.staff.createStaff(payload),
                    'Failed to create staff record'
                )
                showToast('Staff record created', 'success')
            }
            setShowModal(false)
            await loadStaff()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to save staff record', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (member: StaffMember, desired: boolean) => {
        if (!confirm(`${desired ? 'Activate' : 'Deactivate'} ${member.first_name} ${member.last_name}?`)) { return }
        setSaving(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.staff.setStaffActive(member.id, desired),
                'Failed to update staff status'
            )
            await loadStaff()
            showToast(`Staff ${desired ? 'activated' : 'deactivated'}`, 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to update staff status', 'error')
        } finally {
            setSaving(false)
        }
    }

    return {
        staff,
        loading,
        showModal,
        saving,
        editing,
        form,
        setShowModal,
        setForm,
        openCreate,
        openEdit,
        handleSave,
        handleToggleActive,
    }
}
