import React from 'react'
import { X } from 'lucide-react'

import type { StockMovementFormData, Supplier } from './Inventory.types'

type StockMovementModalProps = Readonly<{
    isOpen: boolean
    onClose: () => void
    stockAction: 'IN' | 'OUT'
    selectedItemName: string | undefined
    stockMovement: StockMovementFormData
    onMovementChange: (movement: StockMovementFormData) => void
    suppliers: Supplier[]
    onSubmit: (e: React.SyntheticEvent) => void
}>

export function StockMovementModal({ isOpen, onClose, stockAction, selectedItemName, stockMovement, onMovementChange, suppliers, onSubmit }: StockMovementModalProps) {
    if (!isOpen) { return null }
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-md animate-scale-in">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-foreground">
                        {stockAction === 'IN' ? 'Restock' : 'Issue'} Content
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-xl transition-colors" aria-label="Close stock movement modal"><X className="w-5 h-5 text-foreground/40" /></button>
                </div>
                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-6 px-1">{selectedItemName}</p>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="stock-movement-quantity" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Movement Quantity</label>
                        <input id="stock-movement-quantity" type="number" required min="1" value={stockMovement.quantity}
                            onChange={(e) => onMovementChange({ ...stockMovement, quantity: Number(e.target.value) })}
                            className="input border-border/20" placeholder="0" />
                    </div>
                    {stockAction === 'IN' && (
                        <>
                            <div>
                                <label htmlFor="stock-movement-cost" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Inbound Cost (KES)</label>
                                <input id="stock-movement-cost" type="number" required min="0" value={stockMovement.unit_cost}
                                    onChange={(e) => onMovementChange({ ...stockMovement, unit_cost: Number(e.target.value) })}
                                    className="input border-border/20" placeholder="0.00" />
                            </div>
                            <div>
                                <label htmlFor="stock-movement-supplier" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Vendor / Supplier</label>
                                <select id="stock-movement-supplier" value={stockMovement.supplier_id}
                                    onChange={(e) => onMovementChange({ ...stockMovement, supplier_id: e.target.value })}
                                    className="input border-border/20">
                                    <option value="">Select Supplier (Optional)</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.supplier_name}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                    <div>
                        <label htmlFor="stock-movement-reference" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Documentation Reference</label>
                        <input id="stock-movement-reference" type="text" value={stockMovement.reference_number}
                            onChange={(e) => onMovementChange({ ...stockMovement, reference_number: e.target.value })}
                            className="input border-border/20" placeholder="e.g. Invoice # / Receipt #" />
                    </div>
                    <div>
                        <label htmlFor="stock-movement-description" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Justification</label>
                        <textarea id="stock-movement-description" value={stockMovement.description}
                            onChange={(e) => onMovementChange({ ...stockMovement, description: e.target.value })}
                            className="input border-border/20" rows={2} placeholder="Brief reason for movement..." />
                    </div>
                    <div className="flex justify-end gap-3 mt-8">
                        <button type="button" onClick={onClose} className="btn bg-secondary/50 hover:bg-secondary text-foreground border-border/40 px-6">Cancel</button>
                        <button type="submit" className={`btn px-8 shadow-lg ${stockAction === 'IN' ? 'btn-primary shadow-primary/20' : 'bg-destructive hover:bg-destructive/80 text-white shadow-red-500/20'}`}>
                            {stockAction === 'IN' ? 'Confirm Restock' : 'Confirm Issuance'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
