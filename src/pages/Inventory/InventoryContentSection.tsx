import { Package, ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react'

import { formatCurrencyFromCents } from '../../utils/format'

import type { InventoryItem } from './Inventory.types'

type InventoryContentSectionProps = Readonly<{
    loading: boolean
    filteredItems: InventoryItem[]
    onOpenStockModal: (item: InventoryItem, action: 'IN' | 'OUT') => void
}>

export function InventoryContentSection({ loading, filteredItems, onOpenStockModal }: InventoryContentSectionProps) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">Cataloging Assets...</p>
            </div>
        )
    }

    if (filteredItems.length === 0) {
        return (
            <div className="text-center py-24">
                <Package className="w-20 h-20 mx-auto mb-6 text-foreground/10" />
                <h3 className="text-xl font-bold text-foreground mb-2">Inventory Empty</h3>
                <p className="text-foreground/30 font-medium">Verify your search criteria or register a new school asset.</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto -mx-2">
            <table className="w-full text-left">
                <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border/20">
                        <th className="px-4 py-4">Asset Details</th>
                        <th className="px-4 py-4">Classification</th>
                        <th className="px-4 py-4 text-right">Stock Level</th>
                        <th className="px-4 py-4 text-right">Valuation</th>
                        <th className="px-4 py-4">Availability</th>
                        <th className="px-4 py-4 text-right">Inventory Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                    {filteredItems.map((item) => (
                        <tr key={item.id} className="group hover:bg-accent/20 transition-colors">
                            <td className="px-4 py-5">
                                <p className="font-bold text-foreground group-hover:text-primary transition-colors">{item.item_name}</p>
                                <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest">CODE: {item.item_code}</p>
                            </td>
                            <td className="px-4 py-5 font-bold">
                                <p className="text-xs text-foreground">{item.category_name}</p>
                                <p className="text-[10px] text-foreground/40 font-medium uppercase">{item.unit_of_measure}</p>
                            </td>
                            <td className="px-4 py-5 text-right font-bold text-foreground">
                                {item.current_stock}
                                <p className="text-[10px] text-foreground/40 font-medium uppercase tracking-tighter">Threshold: {item.reorder_level}</p>
                            </td>
                            <td className="px-4 py-5 text-right">
                                <p className="text-xs font-bold text-foreground">{formatCurrencyFromCents(item.unit_cost * item.current_stock)}</p>
                                <p className="text-[10px] text-foreground/40 italic">at {formatCurrencyFromCents(item.unit_cost)}/unit</p>
                            </td>
                            <td className="px-4 py-5">
                                <span className={`text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${item.current_stock <= item.reorder_level
                                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    }`}>
                                    {item.current_stock <= item.reorder_level ? 'Replenish Soon' : 'Optimal'}
                                </span>
                            </td>
                            <td className="px-4 py-5">
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => onOpenStockModal(item, 'IN')}
                                        className="p-3 bg-secondary hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all shadow-sm"
                                        title="Add Stock / Inbound"
                                        aria-label={`Add stock for ${item.item_name}`}
                                    >
                                        <ArrowDownLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onOpenStockModal(item, 'OUT')}
                                        className="p-3 bg-secondary hover:bg-red-500/20 text-red-400 rounded-xl transition-all shadow-sm"
                                        title="Issue Stock / Outbound"
                                        aria-label={`Issue stock for ${item.item_name}`}
                                    >
                                        <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
