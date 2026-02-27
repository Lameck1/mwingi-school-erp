import { Plus, Trash2, Calendar, Users, Briefcase, FileText, CheckCircle2, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'


import { PageHeader } from '../../../components/patterns/PageHeader'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { useFeePolicies } from '../../../hooks/useFeePolicies'
import type { InstallmentPolicy, InstallmentSchedule } from '../../../hooks/useFeePolicies'
import { useAppStore } from '../../../stores'

export default function FeePoliciesConfig() {
    const { getPoliciesForTerm, createInstallmentPolicy, deactivatePolicy, getInstallmentSchedule, isLoading } = useFeePolicies()
    const { currentAcademicYear } = useAppStore()
    const { showToast } = useToast()

    const [policies, setPolicies] = useState<InstallmentPolicy[]>([])
    const [selectedPolicySchedules, setSelectedPolicySchedules] = useState<InstallmentSchedule[]>([])
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [policyToDelete, setPolicyToDelete] = useState<number | null>(null)

    // Form State
    const [policyName, setPolicyName] = useState('')
    const [studentType, setStudentType] = useState<'DAY_SCHOLAR' | 'BOARDER' | 'ALL'>('ALL')
    const [schedules, setSchedules] = useState<Omit<InstallmentSchedule, 'id'>[]>([
        { installment_number: 1, percentage: 50, due_date: '', description: 'Term 1 First Half' },
        { installment_number: 2, percentage: 50, due_date: '', description: 'Term 1 Second Half' }
    ])

    const fetchPolicies = useCallback(async () => {
        if (!currentAcademicYear) {
            return
        }
        const data = await getPoliciesForTerm(currentAcademicYear.id)
        if (data) {
            setPolicies(data)
        }
    }, [currentAcademicYear, getPoliciesForTerm])

    useEffect(() => {
        void fetchPolicies()
    }, [fetchPolicies])

    const handleViewSchedules = async (policyId: number) => {
        const data = await getInstallmentSchedule(policyId)
        if (data) {
            setSelectedPolicySchedules(data)
        }
    }

    const handleCreatePolicy = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!currentAcademicYear) {
            return
        }

        const totalPercentage = schedules.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0)
        if (totalPercentage !== 100) {
            showToast(`Total percentage must be 100%. Currently at ${totalPercentage}%`, 'error')
            return
        }

        const successId = await createInstallmentPolicy({
            policy_name: policyName,
            academic_year_id: currentAcademicYear.id,
            student_type: studentType,
            schedules: schedules.map(s => ({ ...s, percentage: Number(s.percentage) }))
        })

        if (successId) {
            showToast('Fee installment policy created successfully', 'success')
            setIsCreateModalOpen(false)
            resetForm()
            void fetchPolicies()
        }
    }

    const handleDeletePolicy = async () => {
        if (!policyToDelete) {
            return
        }
        const success = await deactivatePolicy(policyToDelete)
        if (success) {
            showToast('Policy deactivated successfully', 'success')
            setPolicyToDelete(null)
            void fetchPolicies()
            setSelectedPolicySchedules([])
        }
    }

    const resetForm = () => {
        setPolicyName('')
        setStudentType('ALL')
        setSchedules([
            { installment_number: 1, percentage: 50, due_date: '', description: '' },
            { installment_number: 2, percentage: 50, due_date: '', description: '' }
        ])
    }

    const addScheduleRow = () => {
        setSchedules(prev => [
            ...prev,
            { installment_number: prev.length + 1, percentage: 0, due_date: '', description: '' }
        ])
    }

    const removeScheduleRow = (index: number) => {
        if (schedules.length <= 2) {
            showToast('A policy must have at least 2 installments', 'warning')
            return
        }
        const updated = [...schedules]
        updated.splice(index, 1)
        // Re-number
        const renumbered = updated.map((s, i) => ({ ...s, installment_number: i + 1 }))
        setSchedules(renumbered)
    }

    const updateSchedule = (index: number, field: keyof InstallmentSchedule, value: string | number) => {
        const updated = [...schedules]
        updated[index] = { ...updated[index], [field]: value } as unknown as InstallmentSchedule
        setSchedules(updated)
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                    <PageHeader
                        title="Fee Policies"
                        subtitle="Manage installment schedules and academic term spread rules"
                        breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Settings' }, { label: 'Fee Policies' }]}
                    />
                    {!currentAcademicYear && (
                        <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 text-sm">
                            Select or create an Academic Year to view and create installment policies.
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="btn btn-primary flex items-center gap-2 shadow-lg shadow-primary/20 hover:-translate-y-0.5"
                    disabled={!currentAcademicYear}
                >
                    <Plus className="w-4 h-4" /> Create Policy
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Policy List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Briefcase className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold">Active Policies</h2>
                    </div>

                    {(() => {
                        if (isLoading && policies.length === 0) {
                            return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                        }
                        if (policies.length === 0) {
                            return (
                                <div className="card !p-10 text-center flex flex-col items-center">
                                    <FileText className="w-12 h-12 text-foreground/20 mb-4" />
                                    <p className="font-bold text-foreground">No fee policies configured</p>
                                    <p className="text-sm text-foreground/50 mt-1">Create an installment policy to define how fees are broken down.</p>
                                </div>
                            )
                        }
                        return (
                            <div className="grid grid-cols-1 gap-4">
                                {policies.map(policy => (
                                    <div key={policy.id} className="card !p-5 hover:border-primary/50 transition-colors group cursor-pointer" onClick={() => handleViewSchedules(policy.id)}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{policy.policy_name}</h3>
                                                <div className="flex gap-4 mt-2">
                                                    <span className="text-xs font-semibold px-2.5 py-1 bg-secondary rounded-md text-foreground/60 flex items-center gap-1.5">
                                                        <Users className="w-3.5 h-3.5" />
                                                        {policy.student_type.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-md flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {policy.number_of_installments} Installments
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPolicyToDelete(policy.id) }}
                                                    className="p-2 text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
                                                    title="Deactivate Policy"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    })()}
                </div>

                {/* Schedule Details Pane */}
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <FileText className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-bold">Installment Details</h2>
                    </div>

                    <div className="card !p-5 bg-gradient-to-br from-background to-secondary/30">
                        {selectedPolicySchedules.length === 0 ? (
                            <div className="py-10 text-center">
                                <p className="text-[11px] font-bold tracking-widest uppercase text-foreground/40">Select a policy to view</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {selectedPolicySchedules.map((schedule, idx) => (
                                    <div key={idx} className="p-3 bg-background border border-border/40 rounded-xl relative overflow-hidden group">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                                        <div className="flex justify-between items-center pl-3">
                                            <div>
                                                <p className="text-xs font-bold text-foreground/50 uppercase">Inst {schedule.installment_number}</p>
                                                <p className="font-bold text-foreground mt-0.5">{schedule.description || `Installment ${schedule.installment_number}`}</p>
                                                <p className="text-[11px] font-medium text-foreground/60 flex items-center gap-1 mt-1">
                                                    <Calendar className="w-3 h-3" /> Due: {schedule.due_date || 'N/A'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-amber-500">{schedule.percentage}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Policy Modal */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Installment Policy" size="lg">
                <form onSubmit={handleCreatePolicy} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="label">Policy Name</label>
                            <input
                                required
                                value={policyName}
                                onChange={e => setPolicyName(e.target.value)}
                                className="input"
                                placeholder="e.g. Standard 3-Term Split"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="label" htmlFor="student-application">Student Application</label>
                            <select
                                id="student-application"
                                value={studentType}
                                onChange={e => setStudentType(e.target.value as 'DAY_SCHOLAR' | 'BOARDER' | 'ALL')}
                                className="input"
                            >
                                <option value="ALL">All Students</option>
                                <option value="DAY_SCHOLAR">Day Scholars Only</option>
                                <option value="BOARDER">Boarders Only</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="label mb-0">Installment Schedule Tracking</label>
                            <button
                                type="button"
                                onClick={addScheduleRow}
                                className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Row
                            </button>
                        </div>

                        <div className="space-y-2">
                            {schedules.map((schedule, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-secondary/10 rounded-xl border border-secondary/20">
                                    <div className="w-10 text-center font-bold text-foreground/40 flex-shrink-0">#{schedule.installment_number}</div>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max="100"
                                        step="0.01"
                                        value={schedule.percentage}
                                        onChange={e => updateSchedule(idx, 'percentage', e.target.value)}
                                        className="input py-2 text-sm w-24 flex-shrink-0"
                                        placeholder="%"
                                        aria-label="Installment percentage"
                                    />
                                    <input
                                        type="date"
                                        value={schedule.due_date}
                                        onChange={e => updateSchedule(idx, 'due_date', e.target.value)}
                                        className="input py-2 text-sm flex-shrink-0 w-36"
                                        aria-label="Installment due date"
                                    />
                                    <input
                                        type="text"
                                        value={schedule.description}
                                        onChange={e => updateSchedule(idx, 'description', e.target.value)}
                                        className="input py-2 text-sm flex-grow"
                                        placeholder="Description (optional)"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeScheduleRow(idx)}
                                        className="p-2 text-destructive/50 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                        title="Remove row"
                                        aria-label="Remove installment row"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Total Percentage</div>
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                {schedules.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0)}%
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary">Cancel</button>
                        <button type="submit" disabled={isLoading} className="btn btn-primary flex items-center gap-2">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Save Policy
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={policyToDelete !== null}
                title="Deactivate Policy"
                message="Are you sure you want to deactivate this policy? It will no longer be available for new terms."
                confirmLabel="Deactivate"
                onCancel={() => setPolicyToDelete(null)}
                onConfirm={handleDeletePolicy}
                isProcessing={isLoading}
            />
        </div>
    )
}
