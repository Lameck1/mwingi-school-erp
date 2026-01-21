import { useEffect, useState } from 'react'
import { Plus, Package, AlertTriangle, Search, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react'

export default function Inventory() {
    const [items, setItems] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])
    const [lowStock, setLowStock] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    
    // Modals state
    const [showAddModal, setShowAddModal] = useState(false)
    const [showStockModal, setShowStockModal] = useState(false)
    const [selectedItem, setSelectedItem] = useState<any>(null)
    const [stockAction, setStockAction] = useState<'IN' | 'OUT'>('IN')

    // Form data
    const [newItem, setNewItem] = useState({
        item_code: '', item_name: '', category_id: '', 
        unit_of_measure: 'Pieces', reorder_level: 10, unit_cost: 0
    })
    
    const [stockMovement, setStockMovement] = useState({
        quantity: 0, unit_cost: 0, description: '', reference_number: ''
    })

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        try {
            const [itemsData, lowStockData, catsData] = await Promise.all([
                window.electronAPI.getInventory(),
                window.electronAPI.getLowStockItems(),
                window.electronAPI.getInventoryCategories()
            ])
            setItems(itemsData)
            setLowStock(lowStockData)
            setCategories(catsData)
        } catch (error) {
            console.error('Failed to load inventory:', error)
        } finally { setLoading(false) }
    }

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await window.electronAPI.createInventoryItem(newItem)
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
            await window.electronAPI.recordStockMovement({
                item_id: selectedItem.id,
                movement_type: stockAction,
                ...stockMovement,
                movement_date: new Date().toISOString().split('T')[0],
                supplier_id: null // TODO: Add supplier selection
            }, 1) // TODO: Get actual user ID
            
            setShowStockModal(false)
            setStockMovement({ quantity: 0, unit_cost: 0, description: '', reference_number: '' })
            loadData()
        } catch (error) {
            console.error('Failed to record movement:', error)
        }
    }

    const openStockModal = (item: any, action: 'IN' | 'OUT') => {
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
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
                    <p className="text-gray-500 mt-1">Manage school supplies and stock</p>
                </div>
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span>Add Item</span>
                </button>
            </div>

            {/* Low Stock Alert */}
            {lowStock.length > 0 && (
                <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div>
                        <h3 className="font-medium text-orange-800">Low Stock Alert</h3>
                        <p className="text-sm text-orange-700 mt-1">
                            {lowStock.length} item(s) are below reorder level: {lowStock.map(i => i.item_name).join(', ')}
                        </p>
                    </div>
                </div>
            )}

            <div className="card mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search items..." className="input pl-10" />
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Inventory Items</h3>
                        <p className="text-gray-500 mb-4">Start tracking school supplies and materials</p>
                        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">Add First Item</button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item Code</th>
                                <th>Item Name</th>
                                <th>Category</th>
                                <th>Unit</th>
                                <th>Stock</th>
                                <th>Reorder Level</th>
                                <th>Unit Cost</th>
                                <th>Value</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item) => (
                                <tr key={item.id}>
                                    <td className="font-mono text-sm">{item.item_code}</td>
                                    <td className="font-medium">{item.item_name}</td>
                                    <td>{item.category_name}</td>
                                    <td>{item.unit_of_measure}</td>
                                    <td>{item.current_stock}</td>
                                    <td>{item.reorder_level}</td>
                                    <td>{formatCurrency(item.unit_cost)}</td>
                                    <td>{formatCurrency(item.current_stock * item.unit_cost)}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.current_stock <= item.reorder_level
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-green-100 text-green-700'
                                            }`}>{item.current_stock <= item.reorder_level ? 'Low Stock' : 'In Stock'}</span>
                                    </td>
                                    <td>
                                        <div className="flex gap-2">
                                            <button onClick={() => openStockModal(item, 'IN')} 
                                                title="Add Stock" aria-label="Add Stock"
                                                className="p-1 text-green-600 hover:bg-green-50 rounded">
                                                <ArrowDownLeft className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => openStockModal(item, 'OUT')} 
                                                title="Remove Stock" aria-label="Remove Stock"
                                                className="p-1 text-red-600 hover:bg-red-50 rounded">
                                                <ArrowUpRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Item Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Add Inventory Item</h2>
                            <button onClick={() => setShowAddModal(false)} aria-label="Close modal"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddItem} className="space-y-4">
                            <div>
                                <label className="label">Item Code *</label>
                                <input type="text" required value={newItem.item_code}
                                    onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })}
                                    className="input" placeholder="e.g. STN-001" />
                            </div>
                            <div>
                                <label className="label">Item Name *</label>
                                <input type="text" required value={newItem.item_name}
                                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                                    className="input" placeholder="e.g. A4 Paper Ream" />
                            </div>
                            <div>
                                <label className="label">Category *</label>
                                <select required value={newItem.category_id}
                                    aria-label="Category"
                                    onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}
                                    className="input">
                                    <option value="">Select Category</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.category_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Unit *</label>
                                    <input type="text" required value={newItem.unit_of_measure}
                                        onChange={(e) => setNewItem({ ...newItem, unit_of_measure: e.target.value })}
                                        className="input" placeholder="e.g. Box" />
                                </div>
                                <div>
                                    <label className="label">Reorder Level *</label>
                                    <input type="number" required value={newItem.reorder_level}
                                        onChange={(e) => setNewItem({ ...newItem, reorder_level: Number(e.target.value) })}
                                        className="input" placeholder="10" />
                                </div>
                            </div>
                            <div>
                                <label className="label">Unit Cost (KES)</label>
                                <input type="number" required value={newItem.unit_cost}
                                    onChange={(e) => setNewItem({ ...newItem, unit_cost: Number(e.target.value) })}
                                    className="input" placeholder="0.00" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-ghost">Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Item</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stock Movement Modal */}
            {showStockModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">
                                {stockAction === 'IN' ? 'Add Stock' : 'Remove Stock'} - {selectedItem?.item_name}
                            </h2>
                            <button onClick={() => setShowStockModal(false)} aria-label="Close modal"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleStockMovement} className="space-y-4">
                            <div>
                                <label className="label">Quantity *</label>
                                <input type="number" required min="1" value={stockMovement.quantity}
                                    onChange={(e) => setStockMovement({ ...stockMovement, quantity: Number(e.target.value) })}
                                    className="input" placeholder="0" />
                            </div>
                            {stockAction === 'IN' && (
                                <div>
                                    <label className="label">Unit Cost (KES) *</label>
                                    <input type="number" required min="0" value={stockMovement.unit_cost}
                                        onChange={(e) => setStockMovement({ ...stockMovement, unit_cost: Number(e.target.value) })}
                                        className="input" placeholder="0.00" />
                                </div>
                            )}
                            <div>
                                <label className="label">Reference / Receipt No.</label>
                                <input type="text" value={stockMovement.reference_number}
                                    onChange={(e) => setStockMovement({ ...stockMovement, reference_number: e.target.value })}
                                    className="input" placeholder="Optional" />
                            </div>
                            <div>
                                <label className="label">Description / Reason</label>
                                <textarea value={stockMovement.description}
                                    onChange={(e) => setStockMovement({ ...stockMovement, description: e.target.value })}
                                    className="input" rows={2} placeholder="Optional" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowStockModal(false)} className="btn btn-ghost">Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {stockAction === 'IN' ? 'Add Stock' : 'Remove Stock'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}