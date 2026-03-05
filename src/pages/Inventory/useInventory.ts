import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { centsToShillings, shillingsToCents } from '../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

import { INITIAL_ITEM, buildStockMovement } from './Inventory.types'
import type { InventoryItem, InventoryCategory, Supplier, AddItemFormData, StockMovementFormData } from './Inventory.types'

export function useInventory() {
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

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
    const [newItem, setNewItem] = useState<AddItemFormData>(INITIAL_ITEM)
    const [stockMovement, setStockMovement] = useState<StockMovementFormData>(buildStockMovement())

    // ── Helpers ───────────────────────────────────────────────

    const closeStockModal = () => {
        setShowStockModal(false)
        setSelectedItem(null)
        setStockMovement(buildStockMovement())
    }

    // ── Data loading ──────────────────────────────────────────

    const loadData = useCallback(async () => {
        try {
            const [itemsData, lowStockData, catsData, suppliersData] = await Promise.all([
                globalThis.electronAPI.operations.getInventory(),
                globalThis.electronAPI.operations.getLowStockItems(),
                globalThis.electronAPI.operations.getInventoryCategories(),
                globalThis.electronAPI.operations.getSuppliers()
            ])

            setItems(unwrapArrayResult(itemsData, 'Failed to load inventory items'))
            setLowStock(unwrapArrayResult(lowStockData, 'Failed to load low-stock data'))
            setCategories(unwrapArrayResult(catsData, 'Failed to load inventory categories'))
            setSuppliers(unwrapArrayResult(suppliersData, 'Failed to load suppliers'))
        } catch (error) {
            console.error('Failed to load inventory:', error)
            setItems([])
            setLowStock([])
            setCategories([])
            setSuppliers([])
            showToast(error instanceof Error ? error.message : 'Failed to load inventory', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { void loadData() }, [loadData])

    // ── Handlers ──────────────────────────────────────────────

    const handleAddItem = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.operations.createInventoryItem({
                    item_code: newItem.item_code,
                    item_name: newItem.item_name,
                    category_id: Number(newItem.category_id),
                    unit_of_measure: newItem.unit_of_measure,
                    reorder_level: newItem.reorder_level,
                    unit_cost: shillingsToCents(newItem.unit_cost)
                }),
                'Failed to add inventory item'
            )

            setShowAddModal(false)
            setNewItem(INITIAL_ITEM)
            await loadData()
            showToast('Asset registered successfully', 'success')
        } catch (error) {
            console.error('Failed to add item:', error)
            showToast(error instanceof Error ? error.message : 'Failed to add item', 'error')
        }
    }

    const handleStockMovement = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (!selectedItem) {
            showToast('Select an inventory item before recording stock movement', 'warning')
            return
        }

        try {
            if (!user) { throw new Error('User not authenticated') }

            unwrapIPCResult(
                await globalThis.electronAPI.operations.recordStockMovement({
                    item_id: selectedItem.id,
                    movement_type: stockAction,
                    quantity: stockMovement.quantity,
                    unit_cost: shillingsToCents(stockMovement.unit_cost),
                    reference_number: stockMovement.reference_number || undefined,
                    description: stockMovement.description || undefined,
                    supplier_id: stockMovement.supplier_id ? Number(stockMovement.supplier_id) : undefined,
                    movement_date: new Date().toISOString()
                } as Parameters<typeof globalThis.electronAPI.operations.recordStockMovement>[0], user.id),
                'Failed to record stock movement'
            )

            closeStockModal()
            await loadData()
            showToast(`Stock ${stockAction === 'IN' ? 'received' : 'issued'} successfully`, 'success')
        } catch (error) {
            console.error('Failed to record movement:', error)
            showToast(error instanceof Error ? error.message : 'Failed to record stock movement', 'error')
        }
    }

    const openStockModal = (item: InventoryItem, action: 'IN' | 'OUT') => {
        setSelectedItem(item)
        setStockAction(action)
        setStockMovement(buildStockMovement(centsToShillings(item.unit_cost)))
        setShowStockModal(true)
    }

    // ── Derived data ──────────────────────────────────────────

    const filteredItems = useMemo(() => items.filter(i =>
        i.item_name.toLowerCase().includes(search.toLowerCase()) ||
        i.item_code.toLowerCase().includes(search.toLowerCase())
    ), [items, search])

    return {
        // Data
        items,
        categories,
        suppliers,
        lowStock,
        loading,
        filteredItems,

        // Search
        search,
        setSearch,

        // Add item modal
        showAddModal,
        setShowAddModal,
        newItem,
        setNewItem,
        handleAddItem,

        // Stock movement modal
        showStockModal,
        closeStockModal,
        selectedItem,
        stockAction,
        stockMovement,
        setStockMovement,
        openStockModal,
        handleStockMovement,
    }
}
