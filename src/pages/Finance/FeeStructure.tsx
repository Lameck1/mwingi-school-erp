import { Save, Plus, Loader2 } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { type AcademicYear, type Term, type Stream } from '../../types/electron-api/AcademicAPI'
import { type FeeCategory, type FeeStructureCreateData } from '../../types/electron-api/FinanceAPI'
import { STUDENT_TYPES_LIST } from '../../utils/constants'
import { centsToShillings, formatCurrencyFromCents, shillingsToCents } from '../../utils/format'


interface FeeStructureItem {
    stream_id?: number
    streamId?: number
    student_type?: string
    studentType?: string
    fee_category_id?: number
    feeCategoryId?: number
    amount?: number
}

export default function FeeStructure() {
    const { showToast } = useToast()
    const { user } = useAuthStore()

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

    const loadInitialData = useCallback(async () => {
        try {
            const [y, s, c] = await Promise.all([
                globalThis.electronAPI.getAcademicYears(),
                globalThis.electronAPI.getStreams(),
                globalThis.electronAPI.getFeeCategories()
            ])
            setYears(y)
            setStreams(s)
            setCategories(c)

            // Auto-select current year/term if possible
            const currentYear = await globalThis.electronAPI.getCurrentAcademicYear()
            if (currentYear) {
                setSelectedYear(currentYear.id.toString())
                const termList = await globalThis.electronAPI.getTermsByYear(currentYear.id)
                setTerms(termList)
                const currentTerm = await globalThis.electronAPI.getCurrentTerm()
                if (currentTerm) {setSelectedTerm(currentTerm.id.toString())}
                else if (termList.length > 0) {setSelectedTerm(termList[0].id.toString())}
            }
        } catch (error) {
            console.error(error)
            showToast('Failed to load initial data', 'error')
        }
    }, [showToast])



    useEffect(() => {
        loadInitialData().catch((err: unknown) => console.error('Failed to load fee structure data', err))
    }, [loadInitialData])

    useEffect(() => {
        const loadStructure = async () => {
            setLoading(true)
            try {
                const data = await globalThis.electronAPI.getFeeStructure(Number(selectedYear), Number(selectedTerm))
                const map: Record<string, number> = {}
                data.forEach((item: FeeStructureItem) => {
                    // Handle both FeeStructure and FeeStructureItem formats
                    const streamId = item.stream_id || item.streamId
                    const studentType = item.student_type || item.studentType
                    const categoryId = item.fee_category_id || item.feeCategoryId || item.fee_category_id
                    const amount = item.amount

                    if (streamId && studentType && categoryId && amount !== undefined) {
                        const key = `${streamId}-${studentType}-${categoryId}`
                        // Convert cents from DB to shillings for UI display
                        map[key] = centsToShillings(amount)
                    }
                })
                setStructure(map)
            } catch (error) {
                console.error(error)
                showToast('Failed to load fee structure', 'error')
            } finally {
                setLoading(false)
            }
        }

        if (selectedYear && selectedTerm) {
            void loadStructure()
        }
    }, [selectedYear, selectedTerm, showToast])



    const handleAmountChange = (streamId: number, studentType: string, categoryId: number, value: string) => {
        const key = `${streamId}-${studentType}-${categoryId}`
        setStructure(prev => ({ ...prev, [key]: Number(value) || 0 }))
    }

    const calculateRowTotal = (streamId: number, studentType: string): number => {
        let total = 0
        for (const category of categories) {
            const key = `${streamId}-${studentType}-${category.id}`
            total += structure[key] || 0
        }
        return total
    }

    const renderAmountCells = (streamId: number, studentType: string) => {
        return categories.map(category => {
            const key = `${streamId}-${studentType}-${category.id}`
            return (
                <td key={category.id} className="px-2 py-3 whitespace-nowrap">
                    <input
                        type="number"
                        min="0"
                        value={structure[key] || ''}
                        onChange={event => handleAmountChange(streamId, studentType, category.id, event.target.value)}
                        className="w-full text-right bg-secondary/30 border border-border/20 rounded-lg px-2 py-1.5 text-sm font-mono text-foreground focus:ring-2 focus:ring-primary/20 transition-all"
                        placeholder="0"
                    />
                </td>
            )
        })
    }

    const renderTableRows = () => {
        const rows: JSX.Element[] = []
        for (const stream of streams) {
            for (const [index, studentType] of STUDENT_TYPES_LIST.entries()) {
                rows.push(
                    <tr key={`${stream.id}-${studentType}`} className={`${index === 0 ? 'bg-background' : 'bg-card'} hover:bg-accent/10 transition-colors`}>
                        {index === 0 && (
                            <td
                                rowSpan={2}
                                className="px-4 py-3 whitespace-nowrap text-sm font-bold text-foreground sticky left-0 z-30 border-r border-border/20 bg-background"
                            >
                                {stream.stream_name}
                            </td>
                        )}
                        <td
                            className={`px-4 py-3 whitespace-nowrap text-[10px] font-bold text-foreground/40 uppercase sticky left-[140px] z-30 border-r border-border/20 ${index === 0 ? 'bg-background' : 'bg-card'}`}
                        >
                            {studentType.replace('_', ' ')}
                        </td>
                        {renderAmountCells(stream.id, studentType)}
                        <td
                            className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-emerald-400 text-right sticky right-0 z-30 border-l border-border/20 ${index === 0 ? 'bg-background' : 'bg-card'}`}
                        >
                            {formatCurrencyFromCents(shillingsToCents(calculateRowTotal(stream.id, studentType)))}
                        </td>
                    </tr>
                )
            }
        }
        return rows
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
                        student_type: studentType,
                        fee_category_id: Number(categoryId),
                        // Convert shillings from UI back to cents for DB storage
                        amount: shillingsToCents(amount),
                        academic_year_id: Number(selectedYear),
                        term_id: Number(selectedTerm)
                    })
                }
            }

            await globalThis.electronAPI.saveFeeStructure(data, Number(selectedYear), Number(selectedTerm))
            showToast('Fee structure saved successfully', 'success')
        } catch (error) {
            console.error(error)
            showToast('Failed to save fee structure', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) {return}
        try {
            await globalThis.electronAPI.createFeeCategory(newCategoryName, '')
            setNewCategoryName('')
            setShowNewCategory(false)
            const c = await globalThis.electronAPI.getFeeCategories()
            setCategories(c)
            showToast('Category created', 'success')
        } catch (error) {
            console.error(error)
            showToast('Failed to create category', 'error')
        }
    }

    const handleGenerateInvoices = async () => {
        setGenerating(true)
        try {
            if (!user?.id) {
                showToast('You must be signed in to generate invoices', 'error')
                return
            }

            const result = await globalThis.electronAPI.generateBatchInvoices(Number(selectedYear), Number(selectedTerm), user.id)

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

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Fee Structure' }]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">Fee Structure</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Manage fee amounts per class and term</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleGenerateInvoices}
                        disabled={generating}
                        className="btn btn-secondary flex items-center gap-2"
                        title="Generate invoices for all students based on this structure"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Batch Invoice
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="premium-card mb-6 p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label htmlFor="field-220" className="block text-[10px] font-bold text-foreground/40 uppercase tracking-widest mb-1.5 ml-1">Academic Year</label>
                        <select id="field-220"
                            value={selectedYear}
                            onChange={e => {
                                setSelectedYear(e.target.value)
                                globalThis.electronAPI
                                    .getTermsByYear(Number(e.target.value))
                                    .then(terms => setTerms(terms))
                                    .catch((error) => {
                                        console.error('Failed to load terms:', error)
                                    })
                            }}
                            className="input w-full border-border/20 focus:border-primary/50 transition-all font-medium py-2.5"
                        >
                            <option value="" className="bg-background">Select Year</option>
                            {years.map(y => (
                                <option key={y.id} value={y.id} className="bg-background">{y.year_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label htmlFor="field-236" className="block text-[10px] font-bold text-foreground/40 uppercase tracking-widest mb-1.5 ml-1">Term</label>
                        <select id="field-236"
                            value={selectedTerm}
                            onChange={e => setSelectedTerm(e.target.value)}
                            className="input w-full border-border/20 focus:border-primary/50 transition-all font-medium py-2.5"
                            disabled={!selectedYear}
                        >
                            <option value="" className="bg-background">Select Term</option>
                            {terms.map(t => (
                                <option key={t.id} value={t.id} className="bg-background">{t.term_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <div className="premium-card">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-foreground">Fee Matrix</h3>
                        <button
                            onClick={() => setShowNewCategory(true)}
                            className="text-sm text-primary hover:text-primary p-2 hover:bg-primary/10 rounded-xl transition-all font-bold flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" /> Add Category
                        </button>
                    </div>

                    {showNewCategory && (
                        <div className="mb-6 flex gap-2 items-center bg-primary/5 border border-primary/10 p-4 rounded-xl animate-in slide-in-from-top-2 duration-300">
                            <input
                                type="text"
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                                placeholder="New Category Name (e.g. Swimming)"
                                className="input flex-1 h-10"
                            />
                            <button onClick={handleCreateCategory} className="btn btn-primary h-10 px-4">Add</button>
                            <button onClick={() => setShowNewCategory(false)} className="btn btn-secondary h-10 px-4">Cancel</button>
                        </div>
                    )}

                    {/* Scrollable Table Container - max height with hidden scrollbar */}
                    <div className="overflow-auto no-scrollbar max-h-[60vh] rounded-xl border border-border/20">
                        <table className="min-w-full divide-y divide-border/20">
                            <thead className="sticky top-0 z-40">
                                <tr className="bg-card">
                                    <th className="px-4 py-4 text-left text-[10px] font-bold text-foreground/40 uppercase tracking-widest sticky left-0 bg-card z-50 min-w-[140px] border-r border-border/20">Class / Stream</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-bold text-foreground/40 uppercase tracking-widest sticky left-[140px] bg-card z-50 min-w-[100px] border-r border-border/20">Type</th>
                                    {categories.map(cat => (
                                        <th key={cat.id} className="px-4 py-4 text-left text-[10px] font-bold text-foreground/40 uppercase tracking-widest min-w-[120px] bg-card">
                                            {cat.category_name}
                                        </th>
                                    ))}
                                    <th className="px-4 py-4 text-left text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest sticky right-0 bg-card z-50 border-l border-border/20">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {renderTableRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
