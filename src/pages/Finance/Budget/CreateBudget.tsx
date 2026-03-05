import {
    ArrowLeft, Plus, Trash2, Save, AlertCircle,
    DollarSign
} from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { useAppStore, useAuthStore } from '../../../stores'
import { type CreateBudgetLineItemData } from '../../../types/electron-api'
import { formatCurrency, shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult } from '../../../utils/ipc'

interface TransactionCategory {
    id: number
    category_name: string
    category_type: 'INCOME' | 'EXPENSE'
}

type BudgetLineItem = CreateBudgetLineItemData & { tempId: string }

const createLineItem = (): BudgetLineItem => ({
    tempId: globalThis.crypto.randomUUID(),
    category_id: 0,
    description: '',
    budgeted_amount: 0
})

interface BudgetLineItemsSectionProps {
    lineItems: BudgetLineItem[]
    categories: TransactionCategory[]
    totalBudgeted: number
    onAddLine: () => void
    onRemoveLine: (index: number) => void
    onUpdateLine: (index: number, field: keyof CreateBudgetLineItemData, value: unknown) => void
}

function BudgetLineItemsSection({ lineItems, categories, totalBudgeted, onAddLine, onRemoveLine, onUpdateLine }: Readonly<BudgetLineItemsSectionProps>) {
    return (
        <div className="premium-card space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">Budget Line Items</h2>
                <button
                    type="button"
                    onClick={onAddLine}
                    className="btn btn-secondary flex items-center gap-2 text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Line
                </button>
            </div>

            <div className="space-y-4">
                {lineItems.map((item, index) => (
                    <div key={item.tempId} className="flex items-start gap-4 p-4 bg-white/[0.02] rounded-xl border border-border/20">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label htmlFor="field-208" className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                                    Category
                                </label>
                                <select id="field-208"
                                    value={item.category_id}
                                    onChange={(e) => onUpdateLine(index, 'category_id', Number(e.target.value))}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    aria-label="Budget category"
                                >
                                    <option value={0}>Select category...</option>
                                    <optgroup label="Income">
                                        {categories.filter(c => c.category_type === 'INCOME').map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Expense">
                                        {categories.filter(c => c.category_type === 'EXPENSE').map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="field-232" className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                                    Description
                                </label>
                                <input id="field-232"
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => onUpdateLine(index, 'description', e.target.value)}
                                    placeholder="e.g., Teacher salaries"
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="field-245" className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                                    Amount (KES)
                                </label>
                                <input id="field-245"
                                    type="number"
                                    value={item.budgeted_amount || ''}
                                    onChange={(e) => onUpdateLine(index, 'budgeted_amount', Number(e.target.value))}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => onRemoveLine(index)}
                            disabled={lineItems.length === 1}
                            className="p-2 text-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Remove line item"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
                <span className="text-sm font-bold text-foreground/60 uppercase tracking-wider">
                    Total Budget:
                </span>
                <div className="flex items-center gap-2 text-2xl font-bold text-foreground font-mono">
                    <DollarSign className="w-5 h-5 text-primary" />
                    {formatCurrency(totalBudgeted)}
                </div>
            </div>
        </div>
    )
}

export default function CreateBudget() {
    const navigate = useNavigate()
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)
    const currentTerm = useAppStore((s) => s.currentTerm)
    const user = useAuthStore((s) => s.user)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [categories, setCategories] = useState<TransactionCategory[]>([])

    // Form state
    const [budgetName, setBudgetName] = useState('')
    const [notes, setNotes] = useState('')
    const [lineItems, setLineItems] = useState<BudgetLineItem[]>([createLineItem()])

    useEffect(() => {
        void loadCategories()
    }, [])

    const loadCategories = async () => {
        try {
            const data = unwrapArrayResult(
                await globalThis.electronAPI.finance.getTransactionCategories(),
                'Failed to load transaction categories'
            )
            setCategories(data)
        } catch (err) {
            console.error('Failed to load categories:', err)
            setError(err instanceof Error ? err.message : 'Failed to load transaction categories')
            setCategories([])
        }
    }

    const addLineItem = () => {
        setLineItems([...lineItems, createLineItem()])
    }

    const removeLineItem = (index: number) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter((_, i) => i !== index))
        }
    }

    const updateLineItem = (index: number, field: keyof CreateBudgetLineItemData, value: unknown) => {
        const updated = [...lineItems]
        const existing = updated[index]
        if (existing) {
            updated[index] = { ...existing, [field]: value }
            setLineItems(updated)
        }
    }

    const totalBudgeted = lineItems.reduce((sum, item) => sum + (item.budgeted_amount || 0), 0)

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        setError(null)

        if (!budgetName.trim()) {
            setError('Budget name is required')
            return
        }

        if (!currentAcademicYear) {
            setError('No academic year selected')
            return
        }

        const validLineItems = lineItems.filter(item =>
            item.category_id > 0 && item.description.trim() && item.budgeted_amount > 0
        )

        if (validLineItems.length === 0) {
            setError('At least one valid line item is required')
            return
        }

        if (!user?.id) {
            setError('You must be signed in to create a budget')
            return
        }

        setLoading(true)
        try {
            const result = await globalThis.electronAPI.finance.createBudget({
                budget_name: budgetName,
                academic_year_id: currentAcademicYear.id,
                term_id: currentTerm?.id,
                notes: notes || undefined,
                line_items: validLineItems.map(({ tempId: _tempId, ...item }) => ({
                    ...item,
                    budgeted_amount: shillingsToCents(item.budgeted_amount) // Whole currency units
                }))
            } as Parameters<typeof globalThis.electronAPI.finance.createBudget>[0], user.id)

            if (result.success) {
                navigate('/budget')
            } else {
                setError(result.errors?.join(', ') || 'Failed to create budget')
            }
        } catch (err) {
            setError('An unexpected error occurred')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Create New Budget"
                subtitle="Define budget allocations for the academic period"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Budgets', href: '/budget' }, { label: 'New' }]}
                actions={
                    <button
                        onClick={() => navigate('/budget')}
                        className="btn btn-secondary flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-8">
                {error && (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Basic Info */}
                <div className="premium-card space-y-6">
                    <h2 className="text-lg font-bold text-foreground">Budget Details</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="field-151" className="text-sm font-bold text-foreground/60 uppercase tracking-wider">
                                Budget Name *
                            </label>
                            <input id="field-151"
                                type="text"
                                value={budgetName}
                                onChange={(e) => setBudgetName(e.target.value)}
                                placeholder="e.g., Term 1 2024 Budget"
                                className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="field-176" className="text-sm font-bold text-foreground/60 uppercase tracking-wider">
                                Academic Period
                            </label>
                            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 text-foreground/70">
                                {currentAcademicYear?.year_name || 'Not set'}
                                {currentTerm && ` • ${currentTerm.term_name}`}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="field-176" className="text-sm font-bold text-foreground/60 uppercase tracking-wider">
                            Notes
                        </label>
                        <textarea id="field-176"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Additional notes about this budget..."
                            rows={3}
                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        />
                    </div>
                </div>

                <BudgetLineItemsSection
                    lineItems={lineItems}
                    categories={categories}
                    totalBudgeted={totalBudgeted}
                    onAddLine={addLineItem}
                    onRemoveLine={removeLineItem}
                    onUpdateLine={updateLineItem}
                />

                {/* Actions */}
                <div className="flex items-center justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/budget')}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        {loading ? 'Creating...' : 'Create Budget'}
                    </button>
                </div>
            </form>
        </div>
    )
}

