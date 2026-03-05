import { Plus } from 'lucide-react'

import { type Stream } from '../../../types/electron-api/AcademicAPI'
import { type FeeCategory } from '../../../types/electron-api/FinanceAPI'
import { STUDENT_TYPES_LIST } from '../../../utils/constants'
import { formatCurrencyFromCents, shillingsToCents } from '../../../utils/format'

type FeeMatrixSectionProps = Readonly<{
    loading: boolean
    categories: FeeCategory[]
    streams: Stream[]
    structure: Record<string, number>
    onAmountChange: (streamId: number, studentType: string, categoryId: number, value: string) => void
    showNewCategory: boolean
    onToggleNewCategory: (show: boolean) => void
    newCategoryName: string
    onNewCategoryNameChange: (name: string) => void
    onCreateCategory: () => void
}>

export function FeeMatrixSection({
    loading, categories, streams, structure, onAmountChange,
    showNewCategory, onToggleNewCategory, newCategoryName, onNewCategoryNameChange, onCreateCategory
}: FeeMatrixSectionProps) {
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
                        onChange={event => onAmountChange(streamId, studentType, category.id, event.target.value)}
                        className="w-full text-right bg-secondary/30 border border-border/20 rounded-lg px-2 py-1.5 text-sm font-mono text-foreground focus:ring-2 focus:ring-primary/20 transition-all"
                        placeholder="0"
                    />
                </td>
            )
        })
    }

    const renderTableRows = () => {
        const rows: Array<ReturnType<typeof renderAmountCells>[number]> = []
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

    if (loading) {
        return <div className="text-center py-12">Loading...</div>
    }

    return (
        <div className="premium-card">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-foreground">Fee Matrix</h3>
                <button
                    onClick={() => onToggleNewCategory(true)}
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
                        onChange={e => onNewCategoryNameChange(e.target.value)}
                        placeholder="New Category Name (e.g. Swimming)"
                        className="input flex-1 h-10"
                    />
                    <button onClick={onCreateCategory} className="btn btn-primary h-10 px-4">Add</button>
                    <button onClick={() => onToggleNewCategory(false)} className="btn btn-secondary h-10 px-4">Cancel</button>
                </div>
            )}

            {/* Scrollable Table Container */}
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
    )
}
