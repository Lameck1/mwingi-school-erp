import type React from 'react'
import { useState, useEffect, useCallback } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAppStore, useAuthStore } from '../../../stores'
import { type TransportRoute } from '../../../types/electron-api/OperationsAPI'
import { shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

interface TransportSummary {
    totalRoutes: number
    totalStudents: number
}

interface GLAccountOption {
    code: string
    label: string
}

const resolveTermNumber = (termName?: string, termNumber?: number): number | null => {
    if (typeof termNumber === 'number' && Number.isInteger(termNumber) && termNumber > 0) {
        return termNumber
    }
    if (!termName) {
        return null
    }
    const parsed = Number.parseInt(termName.replaceAll(/\D/g, ''), 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const createEmptyCreateForm = () => ({
    route_name: '',
    distance_km: '',
    estimated_students: '',
    budget_per_term: ''
})

const createEmptyExpenseForm = (glAccountCode = '') => ({
    route_id: '',
    expense_type: 'FUEL',
    amount: '',
    description: '',
    gl_account_code: glAccountCode
})

export { type TransportSummary, type GLAccountOption, resolveTermNumber }

export function useTransportRouteManagement() {
    const { showToast } = useToast()
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)
    const currentTerm = useAppStore((s) => s.currentTerm)
    const user = useAuthStore((s) => s.user)
    const [loading, setLoading] = useState(false)
    const [routes, setRoutes] = useState<TransportRoute[]>([])
    const [summary, setSummary] = useState<TransportSummary | null>(null)
    const [expenseAccounts, setExpenseAccounts] = useState<GLAccountOption[]>([])

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [createForm, setCreateForm] = useState(createEmptyCreateForm())

    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseForm, setExpenseForm] = useState(createEmptyExpenseForm())

    const closeCreateModal = () => {
        setIsCreateModalOpen(false)
        setCreateForm(createEmptyCreateForm())
    }

    const closeExpenseModal = () => {
        setIsExpenseModalOpen(false)
        setExpenseForm(createEmptyExpenseForm(expenseAccounts[0]?.code || ''))
    }

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [routesRaw, glAccountsRaw] = await Promise.all([
                globalThis.electronAPI.operations.getTransportRoutes(),
                globalThis.electronAPI.finance.getGLAccounts({ type: 'EXPENSE', isActive: true })
            ])
            const routesData = unwrapArrayResult(routesRaw, 'Failed to load transport routes')
            setRoutes(routesData)

            const totalRoutes = routesData.length
            const totalStudents = routesData.reduce((acc: number, curr: TransportRoute) => acc + (curr.estimated_students || 0), 0)
            setSummary({ totalRoutes, totalStudents })

            const glResponse = unwrapIPCResult<{
                success: boolean
                data?: Array<{ account_code?: string; account_name?: string }>
                message?: string
            }>(glAccountsRaw, 'Failed to load expense GL accounts')
            const accountOptions = Array.isArray(glResponse.data)
                ? glResponse.data
                    .filter((row) => Boolean(row.account_code))
                    .map((row) => ({
                        code: row.account_code || '',
                        label: `${row.account_code || ''} - ${row.account_name || 'Unnamed account'}`
                    }))
                : []
            setExpenseAccounts(accountOptions)
            if (accountOptions.length > 0) {
                setExpenseForm((prev) => prev.gl_account_code ? prev : { ...prev, gl_account_code: accountOptions[0]?.code || '' })
            }
        } catch (error) {
            console.error(error)
            setRoutes([])
            setSummary(null)
            setExpenseAccounts([])
            showToast(error instanceof Error ? error.message : 'Failed to load transport data', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadData().catch((err: unknown) => console.error('Failed to load transport data', err))
    }, [loadData])

    const handleCreateRoute = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.operations.createTransportRoute({
                    route_name: createForm.route_name,
                    distance_km: Number.parseFloat(createForm.distance_km),
                    estimated_students: Number.parseInt(createForm.estimated_students, 10),
                    budget_per_term_cents: shillingsToCents(createForm.budget_per_term)
                }),
                'Failed to create route'
            )
            showToast('Route created successfully', 'success')
            closeCreateModal()
            await loadData()
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to create route', 'error')
        }
    }

    const handleRecordExpense = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            if (!user) {
                showToast('User not authenticated', 'error')
                return
            }
            const fiscalYear = Number.parseInt(currentAcademicYear?.year_name || '', 10)
            const activeTerm = resolveTermNumber(currentTerm?.term_name, currentTerm?.term_number)
            if (!Number.isInteger(fiscalYear)) {
                showToast('Active academic year is not configured correctly', 'error')
                return
            }
            if (activeTerm === null) {
                showToast('Active term is not configured correctly', 'error')
                return
            }
            if (!expenseForm.gl_account_code.trim()) {
                showToast('Select an expense GL account', 'warning')
                return
            }
            unwrapIPCResult(
                await globalThis.electronAPI.operations.recordTransportExpense({
                    ...expenseForm,
                    route_id: Number.parseInt(expenseForm.route_id, 10),
                    amount_cents: shillingsToCents(expenseForm.amount),
                    fiscal_year: fiscalYear,
                    term: activeTerm,
                    recorded_by: user.id
                }),
                'Failed to record transport expense'
            )
            showToast('Expense recorded successfully', 'success')
            closeExpenseModal()
            await loadData()
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to record expense', 'error')
        }
    }

    const openCreateModal = () => {
        setCreateForm(createEmptyCreateForm())
        setIsCreateModalOpen(true)
    }

    const openExpenseModal = () => {
        setExpenseForm(createEmptyExpenseForm(expenseAccounts[0]?.code || ''))
        setIsExpenseModalOpen(true)
    }

    return {
        loading,
        routes,
        summary,
        expenseAccounts,
        isCreateModalOpen,
        createForm,
        isExpenseModalOpen,
        expenseForm,
        setCreateForm,
        setExpenseForm,
        closeCreateModal,
        closeExpenseModal,
        handleCreateRoute,
        handleRecordExpense,
        openCreateModal,
        openExpenseModal,
    }
}
