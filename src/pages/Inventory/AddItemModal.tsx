import React from 'react'
import { X } from 'lucide-react'

import type { AddItemFormData, InventoryCategory } from './Inventory.types'

type AddItemModalProps = Readonly<{
    isOpen: boolean
    onClose: () => void
    newItem: AddItemFormData
    onItemChange: (item: AddItemFormData) => void
    categories: InventoryCategory[]
    onSubmit: (e: React.SyntheticEvent) => void
}>

export function AddItemModal({ isOpen, onClose, newItem, onItemChange, categories, onSubmit }: AddItemModalProps) {
    if (!isOpen) { return null }
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-md animate-scale-in">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-foreground">Register Asset</h2>
                    <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-xl transition-colors" aria-label="Close add asset modal"><X className="w-5 h-5 text-foreground/40" /></button>
                </div>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="inventory-item-code" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Asset Code</label>
                        <input id="inventory-item-code" type="text" required value={newItem.item_code}
                            onChange={(e) => onItemChange({ ...newItem, item_code: e.target.value })}
                            className="input border-border/20" placeholder="e.g. STN-001" />
                    </div>
                    <div>
                        <label htmlFor="inventory-item-name" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Asset Name</label>
                        <input id="inventory-item-name" type="text" required value={newItem.item_name}
                            onChange={(e) => onItemChange({ ...newItem, item_name: e.target.value })}
                            className="input border-border/20" placeholder="e.g. A4 Paper Ream" />
                    </div>
                    <div>
                        <label htmlFor="inventory-category" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Classification</label>
                        <select id="inventory-category" required value={newItem.category_id}
                            aria-label="Category"
                            onChange={(e) => onItemChange({ ...newItem, category_id: e.target.value })}
                            className="input border-border/20">
                            <option value="">Select Category</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.category_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="inventory-unit" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Unit</label>
                            <input id="inventory-unit" type="text" required value={newItem.unit_of_measure}
                                onChange={(e) => onItemChange({ ...newItem, unit_of_measure: e.target.value })}
                                className="input border-border/20" placeholder="e.g. Box" />
                        </div>
                        <div>
                            <label htmlFor="inventory-threshold" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Threshold</label>
                            <input id="inventory-threshold" type="number" required value={newItem.reorder_level}
                                onChange={(e) => onItemChange({ ...newItem, reorder_level: Number(e.target.value) })}
                                className="input border-border/20" placeholder="10" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="inventory-unit-cost" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Unit Cost (KES)</label>
                        <input id="inventory-unit-cost" type="number" required value={newItem.unit_cost}
                            onChange={(e) => onItemChange({ ...newItem, unit_cost: Number(e.target.value) })}
                            className="input border-border/20" placeholder="0.00" />
                    </div>
                    <div className="flex justify-end gap-3 mt-8">
                        <button type="button" onClick={onClose} className="btn bg-secondary/50 hover:bg-secondary text-foreground border-border/40 px-6">Cancel</button>
                        <button type="submit" className="btn btn-primary px-8 shadow-lg shadow-primary/20">Save Asset</button>
                    </div>
                </form>
            </div>
        </div>
    )
}
