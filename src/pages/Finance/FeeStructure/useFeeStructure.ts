import { useEffect, useState, useCallback } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type AcademicYear, type Term, type Stream } from '../../../types/electron-api/AcademicAPI'
import { type FeeCategory, type FeeStructureCreateData } from '../../../types/electron-api/FinanceAPI'
import { centsToShillings, shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

export function useFeeStructure() {
    const { showToast } = useToast()
    const user = useAuthStore((s) => s.user)

    const [years, setYears] = useState<AcademicYear[]>([])
    const [terms, setTerms] = useState<Term[]>([])
    const [streams, setStreams] = useState<Stream[]>([])
    const [categories, setCategories] = useState<FeeCategory[]>([])

    const [selectedYear, setSelectedYear] = useState('')
    const [selectedTerm, setSelectedTerm] = useState('')

    const [structure, setStructure] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [generating, setGenerating] = useState(false)

    // For new category
    const [showNewCategory, setShowNewCategory] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')

    // ── Data loading ──────────────────────────────────────────

    const loadInitialData = useCallback(async () => {
        try {
            const [yearsRes, streamsRes, catsRes] = await Promise.all([
                globalThis.electronAPI.academic.getAcademicYears(),
                globalThis.electronAPI.academic.getStreams(),
                globalThis.electronAPI.finance.getFeeCategories()
            ])

            const safeYears = unwrapArrayResult(yearsRes, 'Failed to load academic years')
            const safeStreams = unwrapArrayResult(streamsRes, 'Failed to load streams')
            const safeCategories = unwrapArrayResult(catsRes, 'Failed to load fee categories')
            setYears(safeYears)
            setStreams(safeStreams)
            setCategories(safeCategories)

            const currentYear = unwrapIPCResult<AcademicYear>(
                await globalThis.electronAPI.academic.getCurrentAcademicYear(),
                'Failed to load current academic year'
            )
            if (currentYear) {
                setSelectedYear(currentYear.id.toString())
                const safeTermList = unwrapArrayResult(
                    await globalThis.electronAPI.academic.getTermsByYear(currentYear.id),
                    'Failed to load terms for current academic year'
                )
                setTerms(safeTermList)
                const currentTerm = unwrapIPCResult<Term>(
                    await globalThis.electronAPI.academic.getCurrentTerm(),
                    'Failed to load current term'
                )
                if (currentTerm) {
                    setSelectedTerm(currentTerm.id.toString())
                } else if (safeTermList.length > 0 && safeTermList[0]) {
                    setSelectedTerm(safeTermList[0].id.toString())
                }
            }
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to load initial data', 'error')
        }
    }, [showToast])

    useEffect(() => {
        loadInitialData().catch((err: unknown) => console.error('Failed to load fee structure data', err))
    }, [loadInitialData])

    useEffect(() => {
        const loadStructure = async () => {
            setLoading(true)
            try {
                const data = unwrapArrayResult(
                    await globalThis.electronAPI.finance.getFeeStructure(Number(selectedYear), Number(selectedTerm)),
                    'Failed to load fee structure'
                )
                const map: Record<string, number> = {}
                data.forEach((item) => {
                    const streamId = item.stream_id
                    const studentType = item.student_type
                    const categoryId = item.fee_category_id
                    const amount = item.amount

                    if (streamId && studentType && categoryId) {
                        const key = `${streamId}-${studentType}-${categoryId}`
                        map[key] = centsToShillings(amount)
                    }
                })
                setStructure(map)
            } catch (error) {
                console.error(error)
                setStructure({})
                showToast(error instanceof Error ? error.message : 'Failed to load fee structure', 'error')
            } finally {
                setLoading(false)
            }
        }

        if (selectedYear && selectedTerm) {
            void loadStructure()
        } else {
            setStructure({})
            setLoading(false)
        }
    }, [selectedYear, selectedTerm, showToast])

    // ── Handlers ──────────────────────────────────────────────

    const handleAmountChange = (streamId: number, studentType: string, categoryId: number, value: string) => {
        const key = `${streamId}-${studentType}-${categoryId}`
        setStructure(prev => ({ ...prev, [key]: Number(value) || 0 }))
    }

    const handleYearChange = async (yearValue: string) => {
        const yearId = Number(yearValue)
        setSelectedYear(yearValue)
        if (!yearId) {
            setTerms([])
            setSelectedTerm('')
            setStructure({})
            return
        }

        try {
            const loadedTerms = unwrapArrayResult(
                await globalThis.electronAPI.academic.getTermsByYear(yearId),
                'Failed to load terms'
            )
            setTerms(loadedTerms)
            setSelectedTerm((prev) => {
                if (loadedTerms.some((term) => term.id.toString() === prev)) {
                    return prev
                }
                return loadedTerms[0]?.id.toString() || ''
            })
        } catch (error) {
            console.error('Failed to load terms:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load terms', 'error')
            setTerms([])
            setSelectedTerm('')
            setStructure({})
        }
    }

    const handleSave = async () => {
        if (!selectedYear || !selectedTerm) {
            showToast('Please select academic year and term', 'error')
            return
        }

        setSaving(true)
        try {
            const data: FeeStructureCreateData[] = []
            for (const [key, amount] of Object.entries(structure)) {
                if (amount >= 0) {
                    const [streamId, studentType, categoryId] = key.split('-')
                    data.push({
                        stream_id: Number(streamId),
                        student_type: studentType ?? '',
                        fee_category_id: Number(categoryId),
                        amount: shillingsToCents(amount),
                        academic_year_id: Number(selectedYear),
                        term_id: Number(selectedTerm)
                    })
                }
            }

            const result = await globalThis.electronAPI.finance.saveFeeStructure(data, Number(selectedYear), Number(selectedTerm))
            unwrapIPCResult(result, 'Failed to save fee structure')
            showToast('Fee structure saved successfully', 'success')
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to save fee structure', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) {
            showToast('Category name is required', 'warning')
            return
        }
        try {
            unwrapIPCResult(await globalThis.electronAPI.finance.createFeeCategory(newCategoryName, ''), 'Failed to create category')
            setNewCategoryName('')
            setShowNewCategory(false)
            const cats = unwrapArrayResult(await globalThis.electronAPI.finance.getFeeCategories(), 'Failed to reload fee categories')
            setCategories(cats)
            showToast('Category created', 'success')
        } catch (error) {
            console.error(error)
            showToast(error instanceof Error ? error.message : 'Failed to create category', 'error')
        }
    }

    const handleGenerateInvoices = async () => {
        if (!selectedYear || !selectedTerm) {
            showToast('Please select academic year and term before generating invoices', 'error')
            return
        }
        setGenerating(true)
        try {
            if (!user?.id) {
                showToast('You must be signed in to generate invoices', 'error')
                return
            }

            const result = await globalThis.electronAPI.finance.generateBatchInvoices(Number(selectedYear), Number(selectedTerm), user.id)

            if (result.success) {
                showToast(`Successfully generated ${result.count} invoices`, 'success')
            } else {
                showToast('Failed to generate invoices', 'error')
            }
        } catch (error: unknown) {
            console.error('Generation Error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            showToast(`Error: ${errorMessage}`, 'error')
        } finally {
            setGenerating(false)
        }
    }

    return {
        // Data
        years,
        terms,
        streams,
        categories,
        structure,
        loading,
        saving,
        generating,

        // Filters
        selectedYear,
        selectedTerm,
        setSelectedTerm,

        // New category
        showNewCategory,
        setShowNewCategory,
        newCategoryName,
        setNewCategoryName,

        // Handlers
        handleAmountChange,
        handleYearChange,
        handleSave,
        handleCreateCategory,
        handleGenerateInvoices,
    }
}
