import { useEffect, useState, useCallback, useRef, type ChangeEvent, type ComponentType } from 'react'
import { School, Calendar, CreditCard, Globe, MessageSquare, Database } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import { useScrollableTabNav } from '../../hooks/useScrollableTabNav'
import { useAppStore } from '../../stores'
import { type AcademicYear } from '../../types/electron-api/AcademicAPI'
import { type SchoolSettings } from '../../types/electron-api/SettingsAPI'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

export interface NewYearData {
    year_name: string
    start_date: string
    end_date: string
    is_current: boolean
}

export interface SettingsFormData {
    school_name: string
    school_motto: string
    address: string
    phone: string
    email: string
    sms_api_key: string
    sms_api_secret: string
    sms_sender_id: string
    mpesa_paybill: string
    school_type: string
}

export interface TabDef {
    id: string
    label: string
    icon: ComponentType<{ className?: string }>
}

const INITIAL_YEAR_DATA: NewYearData = { year_name: '', start_date: '', end_date: '', is_current: false }

export function useSettingsPage() {
    const schoolSettings = useAppStore((s) => s.schoolSettings)
    const setSchoolSettings = useAppStore((s) => s.setSchoolSettings)
    const { showToast } = useToast()
    const [activeTab, setActiveTab] = useState('school')
    const stableSetActiveTab = useCallback((tab: string) => setActiveTab(tab), [])
    const { navRef, handleTabClick } = useScrollableTabNav(stableSetActiveTab)
    const [saving, setSaving] = useState(false)
    const [loadingYears, setLoadingYears] = useState(false)
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [showYearModal, setShowYearModal] = useState(false)
    const [newYearData, setNewYearData] = useState<NewYearData>(INITIAL_YEAR_DATA)

    const [formData, setFormData] = useState<SettingsFormData>({
        school_name: '', school_motto: '', address: '', phone: '', email: '',
        sms_api_key: '', sms_api_secret: '', sms_sender_id: '',
        mpesa_paybill: '', school_type: 'PUBLIC'
    })

    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)

    const loadLogo = useCallback(async () => {
        try {
            const dataUrl = unwrapIPCResult<string | null>(
                await globalThis.electronAPI.settings.getLogoDataUrl(),
                'Failed to load school logo'
            )
            setLogoDataUrl(typeof dataUrl === 'string' ? dataUrl : null)
        } catch (error) {
            console.error('Failed to load logo:', error)
        }
    }, [])

    useEffect(() => {
        loadLogo().catch(console.error)
    }, [loadLogo])

    useEffect(() => {
        if (schoolSettings) {
            setFormData({
                school_name: schoolSettings.school_name || '',
                school_motto: schoolSettings.school_motto || '',
                address: schoolSettings.address || '',
                phone: schoolSettings.phone || '',
                email: schoolSettings.email || '',
                sms_api_key: schoolSettings.sms_api_key || '',
                sms_api_secret: schoolSettings.sms_api_secret || '',
                sms_sender_id: schoolSettings.sms_sender_id || '',
                mpesa_paybill: schoolSettings.mpesa_paybill || '',
                school_type: schoolSettings.school_type || 'PUBLIC'
            })
        }
    }, [schoolSettings])

    const loadAcademicYears = useCallback(async () => {
        setLoadingYears(true)
        try {
            const years = unwrapArrayResult(
                await globalThis.electronAPI.academic.getAcademicYears(),
                'Failed to load academic cycles'
            )
            setAcademicYears(years)
        } catch (error) {
            setAcademicYears([])
            showToast(error instanceof Error ? error.message : 'Failed to load academic cycles', 'error')
        } finally {
            setLoadingYears(false)
        }
    }, [showToast])

    useEffect(() => {
        if (activeTab === 'academic') {
            loadAcademicYears().catch((err: unknown) => console.error('Failed to load academic years', err))
        }
    }, [activeTab, loadAcademicYears])

    const handleLogoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) { return }

        if (file.size > 5 * 1024 * 1024) {
            showToast('Image file size exceeds 5MB limit', 'error')
            return
        }

        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = reader.result as string
            setSaving(true)
            try {
                const result = await globalThis.electronAPI.settings.uploadLogo(base64)
                if (result.success) {
                    setLogoDataUrl(base64)
                    showToast('School logo updated successfully', 'success')
                } else {
                    showToast(result.error || 'Failed to upload logo', 'error')
                }
            } catch (error) {
                showToast('Logo upload failed', 'error')
                console.error(error)
            } finally {
                setSaving(false)
            }
        }
        reader.readAsDataURL(file)
    }

    const handleRemoveLogo = async () => {
        if (!confirm('Are you sure you want to remove the school logo?')) { return }
        setSaving(true)
        try {
            const result = await globalThis.electronAPI.settings.removeLogo()
            if (result.success) {
                setLogoDataUrl(null)
                showToast('School logo removed', 'success')
            } else {
                showToast(result.error || 'Failed to remove logo', 'error')
            }
        } catch (error) {
            showToast('Remove logo failed', 'error')
            console.error(error)
        } finally {
            setSaving(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const updatePayload: Partial<SchoolSettings> = {}
            if (formData.school_name) { updatePayload.school_name = formData.school_name }
            if (formData.school_motto) { updatePayload.school_motto = formData.school_motto }
            if (formData.address) { updatePayload.address = formData.address }
            if (formData.phone) { updatePayload.phone = formData.phone }
            if (formData.email) { updatePayload.email = formData.email }
            if (formData.mpesa_paybill) { updatePayload.mpesa_paybill = formData.mpesa_paybill }
            updatePayload.school_type = formData.school_type as 'PUBLIC' | 'PRIVATE'
            unwrapIPCResult(
                await globalThis.electronAPI.settings.updateSettings(updatePayload),
                'Failed to update school settings'
            )
            const updated = unwrapIPCResult<SchoolSettings>(
                await globalThis.electronAPI.settings.getSettings(),
                'Failed to reload school settings'
            )
            setSchoolSettings(updated)
            showToast('School settings synchronized successfully', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Critical error updating settings', 'error')
        } finally { setSaving(false) }
    }

    const handleCreateYear = async () => {
        if (!newYearData.year_name || !newYearData.start_date || !newYearData.end_date) {
            showToast('Please fill in all required fields', 'error')
            return
        }
        setSaving(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.createAcademicYear(newYearData),
                'Failed to create academic cycle'
            )
            showToast('Academic cycle established successfully', 'success')
            setShowYearModal(false)
            setNewYearData(INITIAL_YEAR_DATA)
            await loadAcademicYears()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to create academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleActivateYear = async (id: number) => {
        setSaving(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.academic.activateAcademicYear(id),
                'Failed to activate academic cycle'
            )
            showToast('Academic session activated successfully', 'success')
            await loadAcademicYears()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Failed to activate academic year', 'error')
        } finally {
            setSaving(false)
        }
    }

    const tabs: TabDef[] = [
        { id: 'school', label: 'School Info', icon: School },
        { id: 'academic', label: 'Academic Year', icon: Calendar },
        { id: 'payment', label: 'Payment Settings', icon: CreditCard },
        { id: 'integrations', label: 'Integrations', icon: Globe },
        { id: 'templates', label: 'Message Templates', icon: MessageSquare },
        { id: 'maintenance', label: 'System Maintenance', icon: Database },
    ]

    return {
        activeTab, navRef, handleTabClick, tabs,
        saving, setSaving,
        formData, setFormData, logoDataUrl, logoInputRef,
        handleLogoSelect, handleRemoveLogo, handleSave,
        loadingYears, academicYears, showYearModal, setShowYearModal,
        newYearData, setNewYearData, handleCreateYear, handleActivateYear,
    }
}

export type SettingsPageReturn = ReturnType<typeof useSettingsPage>
