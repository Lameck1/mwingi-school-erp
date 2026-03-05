import { Plus, AlertTriangle, Search } from 'lucide-react'

import { HubBreadcrumb } from '../../components/patterns/HubBreadcrumb'

import { AddItemModal } from './AddItemModal'
import { InventoryContentSection } from './InventoryContentSection'
import { StockMovementModal } from './StockMovementModal'
import { useInventory } from './useInventory'

export default function Inventory() {
    const d = useInventory()

    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <HubBreadcrumb crumbs={[{ label: 'Operations' }, { label: 'Inventory' }]} />
                    <h1 className="text-xl md:text-3xl font-bold text-foreground font-heading">Inventory & Logistics</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Manage school assets, supplies, and procurement pipelines</p>
                </div>
                <button
                    onClick={() => d.setShowAddModal(true)}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Register New Asset
                </button>
            </div>

            {/* Critical Alerts */}
            {d.lowStock.length > 0 && (
                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-4 animate-pulse">
                    <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-amber-400">Inventory Depletion Alert</h3>
                        <p className="text-xs text-amber-400/60 font-medium mt-0.5">
                            {d.lowStock.length} items have reached or fallen below critical reorder levels.
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
                        value={d.search}
                        onChange={(e) => d.setSearch(e.target.value)}
                        placeholder="Locate assets by name or system code..."
                        className="input pl-11 py-3.5 border-border/20 focus:border-primary/50 transition-all font-medium"
                    />
                </div>
            </div>

            {/* Main Asset Ledger */}
            <div className="card animate-slide-up no-scrollbar">
                <InventoryContentSection
                    loading={d.loading}
                    filteredItems={d.filteredItems}
                    onOpenStockModal={d.openStockModal}
                />
            </div>

            <AddItemModal
                isOpen={d.showAddModal}
                onClose={() => d.setShowAddModal(false)}
                newItem={d.newItem}
                onItemChange={d.setNewItem}
                categories={d.categories}
                onSubmit={d.handleAddItem}
            />

            <StockMovementModal
                isOpen={d.showStockModal}
                onClose={d.closeStockModal}
                stockAction={d.stockAction}
                selectedItemName={d.selectedItem?.item_name}
                stockMovement={d.stockMovement}
                onMovementChange={d.setStockMovement}
                suppliers={d.suppliers}
                onSubmit={d.handleStockMovement}
            />
        </div>
    )
}
