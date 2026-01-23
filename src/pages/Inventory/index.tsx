import React, { useEffect, useState } from 'react'
import { Plus, Package, AlertTriangle, Search, ArrowUpRight, ArrowDownLeft, X, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../stores'
import { InventoryItem, InventoryCategory, Supplier } from '../../types/electron-api/InventoryAPI'

export default function Inventory() {
    const { user } = useAuthStore()
    const [items, setItems] = useState<InventoryItem[]>([])
    const [categories, setCategories] = useState<InventoryCategory[]>([])
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [lowStock, setLowStock] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modals state
    const [showAddModal, setShowAddModal] = useState(false)
    const [showStockModal, setShowStockModal] = useState(false)
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
    const [stockAction, setStockAction] = useState<'IN' | 'OUT'>('IN')

    // Form data
    const [newItem, setNewItem] = useState({
        item_code: '', item_name: '', category_id: '',
        unit_of_measure: 'Pieces', reorder_level: 10, unit_cost: 0
    })

    const [stockMovement, setStockMovement] = useState({
        quantity: 0, unit_cost: 0, description: '', reference_number: '', supplier_id: ''
    })

    const loadData = async () => {
        try {
            const [itemsData, lowStockData, catsData, suppliersData] = await Promise.all([
                window.electronAPI.getInventory(),
                window.electronAPI.getLowStockItems(),
                window.electronAPI.getInventoryCategories(),
                window.electronAPI.getSuppliers()
            ])
            setItems(itemsData)
            setLowStock(lowStockData)
            setCategories(catsData)
            setSuppliers(suppliersData)
        } catch (error) {
            console.error('Failed to load inventory:', error)
        } finally { setLoading(false) }
    }

    useEffect(() => { loadData() }, [])

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await window.electronAPI.createInventoryItem({
                item_code: newItem.item_code,
                item_name: newItem.item_name,
                category_id: Number(newItem.category_id),
                unit_of_measure: newItem.unit_of_measure,
                reorder_level: newItem.reorder_level,
                unit_cost: newItem.unit_cost
            })
            setShowAddModal(false)
            setNewItem({
                item_code: '', item_name: '', category_id: '',
                unit_of_measure: 'Pieces', reorder_level: 10, unit_cost: 0
            })
            loadData()
        } catch (error) {
            console.error('Failed to add item:', error)
        }
    }

    const handleStockMovement = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedItem) return

        try {
            if (!user) throw new Error('User not authenticated')

            await window.electronAPI.recordStockMovement({
                item_id: selectedItem.id,
                movement_type: stockAction,
                quantity: stockMovement.quantity,
                unit_cost: stockMovement.unit_cost,
                reference_number: stockMovement.reference_number,
                description: stockMovement.description,
                supplier_id: stockMovement.supplier_id ? Number(stockMovement.supplier_id) : undefined,
            }, user.id)

            setShowStockModal(false)
            setStockMovement({ quantity: 0, unit_cost: 0, description: '', reference_number: '', supplier_id: '' })
            loadData()
        } catch (error) {
            console.error('Failed to record movement:', error)
        }
    }

    const openStockModal = (item: InventoryItem, action: 'IN' | 'OUT') => {
        setSelectedItem(item)
        setStockAction(action)
        setStockMovement(prev => ({ ...prev, unit_cost: item.unit_cost }))
        setShowStockModal(true)
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    const filteredItems = items.filter(i =>
        i.item_name.toLowerCase().includes(search.toLowerCase()) ||
        i.item_code.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-white font-heading">Inventory & Logistics</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Manage school assets, supplies, and procurement pipelines</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Register New Asset
                </button>
            </div>

            {/* Critical Alerts */}
            {lowStock.length > 0 && (
                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-4 animate-pulse">
                    <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-amber-400">Inventory Depletion Alert</h3>
                        <p className="text-xs text-amber-400/60 font-medium mt-0.5">
                            {lowStock.length} items have reached or fallen below critical reorder levels.
                        </p>
                    </div>
                </div>
            )}

            {/* Search & Filters */}
            <div className="grid grid-cols-1 gap-6">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Locate assets by name or system code..."
                        className="input pl-11 py-3.5 bg-secondary/30 border-white/5 focus:border-primary/50 transition-all"
                    />
                </div>
            </div>

            {/* Main Asset Ledger */}
            <div className="card animate-slide-up no-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                        <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">Cataloging Assets...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-24">
                        <Package className="w-20 h-20 mx-auto mb-6 text-white/5" />
                        <h3 className="text-xl font-bold text-white mb-2">Inventory Empty</h3>
                        <p className="text-foreground/30 font-medium">Verify your search criteria or register a new school asset.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-white/5">
                                    <th className="px-4 py-4">Asset Details</th>
                                    <th className="px-4 py-4">Classification</th>
                                    <th className="px-4 py-4 text-right">Stock Level</th>
                                    <th className="px-4 py-4 text-right">Valuation</th>
                                    <th className="px-4 py-4">Availability</th>
                                    <th className="px-4 py-4 text-right">Inventory Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredItems.map((item) => (
                                    <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-5">
                                            <p className="font-bold text-white group-hover:text-primary transition-colors">{item.item_name}</p>
                                            <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest">CODE: {item.item_code}</p>
                                        </td>
                                        <td className="px-4 py-5 font-bold">
                                            <p className="text-xs text-white">{item.category_name}</p>
                                            <p className="text-[10px] text-foreground/40 font-medium uppercase">{item.unit_of_measure}</p>
                                        </td>
                                        <td className="px-4 py-5 text-right font-bold text-white">
                                            {item.current_stock}
                                            <p className="text-[10px] text-foreground/40 font-medium uppercase tracking-tighter">Threshold: {item.reorder_level}</p>
                                        </td>
                                        <td className="px-4 py-5 text-right">
                                            <p className="text-xs font-bold text-white">{formatCurrency(item.unit_cost * item.current_stock)}</p>
                                            <p className="text-[10px] text-foreground/40 italic">at {formatCurrency(item.unit_cost)}/unit</p>
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
                                                    onClick={() => openStockModal(item, 'IN')}
                                                    className="p-3 bg-secondary hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all shadow-sm"
                                                    title="Add Stock / Inbound"
                                                >
                                                    <ArrowDownLeft className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openStockModal(item, 'OUT')}
                                                    className="p-3 bg-secondary hover:bg-red-500/20 text-red-400 rounded-xl transition-all shadow-sm"
                                                    title="Issue Stock / Outbound"
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
                )}
            </div>

            {/* Add Item Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Register Asset</h2>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-5 h-5 text-foreground/40" /></button>
                        </div>
                        <form onSubmit={handleAddItem} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Asset Code</label>
                                <input type="text" required value={newItem.item_code}
                                    onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })}
                                    className="input bg-secondary/30 border-white/5" placeholder="e.g. STN-001" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Asset Name</label>
                                <input type="text" required value={newItem.item_name}
                                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                                    className="input bg-secondary/30 border-white/5" placeholder="e.g. A4 Paper Ream" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Classification</label>
                                <select required value={newItem.category_id}
                                    aria-label="Category"
                                    onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}
                                    className="input bg-secondary/30 border-white/5">
                                    <option value="">Select Category</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.category_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Unit</label>
                                    <input type="text" required value={newItem.unit_of_measure}
                                        onChange={(e) => setNewItem({ ...newItem, unit_of_measure: e.target.value })}
                                        className="input bg-secondary/30 border-white/5" placeholder="e.g. Box" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Threshold</label>
                                    <input type="number" required value={newItem.reorder_level}
                                        onChange={(e) => setNewItem({ ...newItem, reorder_level: Number(e.target.value) })}
                                        className="input bg-secondary/30 border-white/5" placeholder="10" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Unit Cost (KES)</label>
                                <input type="number" required value={newItem.unit_cost}
                                    onChange={(e) => setNewItem({ ...newItem, unit_cost: Number(e.target.value) })}
                                    className="input bg-secondary/30 border-white/5" placeholder="0.00" />
                            </div>
                            <div className="flex justify-end gap-3 mt-8">
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn bg-secondary/50 hover:bg-white/10 text-white border-white/5 px-6">Cancel</button>
                                <button type="submit" className="btn btn-primary px-8 shadow-lg shadow-primary/20">Save Asset</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stock Movement Modal */}
            {showStockModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {stockAction === 'IN' ? 'Restock' : 'Issue'} Content
                            </h2>
                            <button onClick={() => setShowStockModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-5 h-5 text-foreground/40" /></button>
                        </div>
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-6 px-1">{selectedItem?.item_name}</p>
                        <form onSubmit={handleStockMovement} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Movement Quantity</label>
                                <input type="number" required min="1" value={stockMovement.quantity}
                                    onChange={(e) => setStockMovement({ ...stockMovement, quantity: Number(e.target.value) })}
                                    className="input bg-secondary/30 border-white/5" placeholder="0" />
                            </div>
                            {stockAction === 'IN' && (
                                <>
                                    <div>
                                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Inbound Cost (KES)</label>
                                        <input type="number" required min="0" value={stockMovement.unit_cost}
                                            onChange={(e) => setStockMovement({ ...stockMovement, unit_cost: Number(e.target.value) })}
                                            className="input bg-secondary/30 border-white/5" placeholder="0.00" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Vendor / Supplier</label>
                                        <select value={stockMovement.supplier_id}
                                            onChange={(e) => setStockMovement({ ...stockMovement, supplier_id: e.target.value })}
                                            className="input bg-secondary/30 border-white/5">
                                            <option value="">Select Supplier (Optional)</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.supplier_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Documentation Reference</label>
                                <input type="text" value={stockMovement.reference_number}
                                    onChange={(e) => setStockMovement({ ...stockMovement, reference_number: e.target.value })}
                                    className="input bg-secondary/30 border-white/5" placeholder="e.g. Invoice # / Receipt #" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest block mb-1.5 ml-1">Justification</label>
                                <textarea value={stockMovement.description}
                                    onChange={(e) => setStockMovement({ ...stockMovement, description: e.target.value })}
                                    className="input bg-secondary/30 border-white/5" rows={2} placeholder="Brief reason for movement..." />
                            </div>
                            <div className="flex justify-end gap-3 mt-8">
                                <button type="button" onClick={() => setShowStockModal(false)} className="btn bg-secondary/50 hover:bg-white/10 text-white border-white/5 px-6">Cancel</button>
                                <button type="submit" className={`btn px-8 shadow-lg ${stockAction === 'IN' ? 'btn-primary shadow-primary/20' : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'}`}>
                                    {stockAction === 'IN' ? 'Confirm Restock' : 'Confirm Issuance'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
