// @vitest-environment jsdom
/**
 * Tests for useInventory hook.
 *
 * Covers: data loading, add item (shillings→cents), stock movement,
 * search filtering, modal helpers, and all error paths.
 */
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

const mockStore = vi.hoisted(() => ({
    user: { id: 1, username: 'admin', role: 'ADMIN' } as Record<string, unknown> | null,
}))

vi.mock('../../../stores', () => ({
    useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ user: mockStore.user }),
}))

vi.mock('../../../utils/ipc', () => ({
    // eslint-disable-next-line sonarjs/function-return-type
    unwrapArrayResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return Array.isArray(value) ? value : []
    },
    unwrapIPCResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return value
    },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        operations: {
            getInventory: vi.fn().mockResolvedValue([]),
            getLowStockItems: vi.fn().mockResolvedValue([]),
            getInventoryCategories: vi.fn().mockResolvedValue([]),
            getSuppliers: vi.fn().mockResolvedValue([]),
            createInventoryItem: vi.fn().mockResolvedValue({ success: true }),
            recordStockMovement: vi.fn().mockResolvedValue({ success: true }),
        },
    }
}

beforeEach(() => {
    mockStore.user = { id: 1, username: 'admin', role: 'ADMIN' }
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useInventory } = await import('../useInventory')

// Helper: fake SyntheticEvent
const fakeEvent = { preventDefault: vi.fn() } as unknown as React.SyntheticEvent

describe('useInventory', () => {
    // ── loadData ────────────────────────────────────────

    describe('loadData', () => {
        it('loads all data in parallel on mount', async () => {
            const mockItems = [{ id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000, reorder_level: 10, current_stock: 20 }]
            const mockLow = [{ id: 2, item_name: 'Eraser', item_code: 'ERS001', unit_cost: 200, reorder_level: 50, current_stock: 5 }]
            const mockCats = [{ id: 10, name: 'Office Supplies' }]
            const mockSuppliers = [{ id: 20, name: 'ABC Ltd' }]

            mockApi.operations.getInventory.mockResolvedValue(mockItems)
            mockApi.operations.getLowStockItems.mockResolvedValue(mockLow)
            mockApi.operations.getInventoryCategories.mockResolvedValue(mockCats)
            mockApi.operations.getSuppliers.mockResolvedValue(mockSuppliers)

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.items).toEqual(mockItems)
            expect(result.current.lowStock).toEqual(mockLow)
            expect(result.current.categories).toEqual(mockCats)
            expect(result.current.suppliers).toEqual(mockSuppliers)
            expect(result.current.loading).toBe(false)
        })

        it('handles loadData failure', async () => {
            mockApi.operations.getInventory.mockRejectedValue(new Error('DB error'))

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.items).toEqual([])
            expect(result.current.lowStock).toEqual([])
            expect(result.current.categories).toEqual([])
            expect(result.current.suppliers).toEqual([])
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
        })

        it('handles loadData non-Error failure', async () => {
            mockApi.operations.getInventory.mockRejectedValue('crash')

            const { result: _result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load inventory', 'error')
        })
    })

    // ── handleAddItem ──────────────────────────────────

    describe('handleAddItem', () => {
        it('adds item converting unit_cost from shillings to cents', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            // Set form data
            act(() => {
                result.current.setNewItem({
                    item_code: 'CHK002',
                    item_name: 'Blue Chalk',
                    category_id: '10',
                    unit_of_measure: 'Pieces',
                    reorder_level: 20,
                    unit_cost: 50, // 50 shillings
                })
                result.current.setShowAddModal(true)
            })

            await act(async () => result.current.handleAddItem(fakeEvent))

            expect(fakeEvent.preventDefault).toHaveBeenCalled()
            expect(mockApi.operations.createInventoryItem).toHaveBeenCalledWith(
                expect.objectContaining({
                    item_code: 'CHK002',
                    item_name: 'Blue Chalk',
                    unit_cost: 5000, // 50 * 100 = 5000 cents
                })
            )
            expect(result.current.showAddModal).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Asset registered successfully', 'success')
        })

        it('handles addItem failure', async () => {
            mockApi.operations.createInventoryItem.mockRejectedValue(new Error('Add fail'))

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setNewItem({ item_code: 'X', item_name: 'Y', category_id: '1', unit_of_measure: 'Pcs', reorder_level: 1, unit_cost: 10 }))
            await act(async () => result.current.handleAddItem(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Add fail', 'error')
        })

        it('handles addItem non-Error failure', async () => {
            mockApi.operations.createInventoryItem.mockRejectedValue(42)

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setNewItem({ item_code: 'X', item_name: 'Y', category_id: '1', unit_of_measure: 'Pcs', reorder_level: 1, unit_cost: 10 }))
            await act(async () => result.current.handleAddItem(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to add item', 'error')
        })
    })

    // ── handleStockMovement ────────────────────────────

    describe('handleStockMovement', () => {
        const sampleItem = { id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000, reorder_level: 10, current_stock: 20 } as never

        it('shows warning when no item selected', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Select an inventory item before recording stock movement', 'warning')
        })

        it('records stock-in movement successfully', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'IN'))
            act(() => result.current.setStockMovement({ quantity: 10, unit_cost: 50, description: 'Restock', reference_number: 'REF001', supplier_id: '20' }))

            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockApi.operations.recordStockMovement).toHaveBeenCalled()
            const callArgs = mockApi.operations.recordStockMovement.mock.calls[0]
            expect(callArgs[0].unit_cost).toBe(5000) // 50 * 100
            expect(callArgs[0].movement_type).toBe('IN')
            expect(mockShowToast).toHaveBeenCalledWith('Stock received successfully', 'success')
            expect(result.current.showStockModal).toBe(false)
        })

        it('records stock-out movement successfully', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'OUT'))
            act(() => result.current.setStockMovement({ quantity: 5, unit_cost: 50, description: '', reference_number: '', supplier_id: '' }))

            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Stock issued successfully', 'success')
        })

        it('handles stock movement failure', async () => {
            mockApi.operations.recordStockMovement.mockRejectedValue(new Error('Move fail'))

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'IN'))
            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Move fail', 'error')
        })

        it('handles stock movement non-Error failure', async () => {
            mockApi.operations.recordStockMovement.mockRejectedValue(null)

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'IN'))
            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to record stock movement', 'error')
        })

        it('throws when user is not authenticated', async () => {
            mockStore.user = null

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'IN'))
            await act(async () => result.current.handleStockMovement(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('User not authenticated', 'error')
        })
    })

    // ── openStockModal / closeStockModal ─────────────

    describe('modal helpers', () => {
        const sampleItem = { id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000, reorder_level: 10, current_stock: 20 } as never

        it('openStockModal sets item, action, converts cost, and shows modal', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'OUT'))

            expect(result.current.showStockModal).toBe(true)
            expect(result.current.selectedItem).toBe(sampleItem)
            expect(result.current.stockAction).toBe('OUT')
            // unit_cost 5000 cents = 50 shillings
            expect(result.current.stockMovement.unit_cost).toBe(50)
        })

        it('closeStockModal resets all stock modal state', async () => {
            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openStockModal(sampleItem, 'IN'))
            expect(result.current.showStockModal).toBe(true)

            act(() => result.current.closeStockModal())
            expect(result.current.showStockModal).toBe(false)
            expect(result.current.selectedItem).toBeNull()
        })
    })

    // ── filteredItems ──────────────────────────────────

    describe('filteredItems', () => {
        it('filters items by name', async () => {
            mockApi.operations.getInventory.mockResolvedValue([
                { id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000 },
                { id: 2, item_name: 'Eraser', item_code: 'ERS001', unit_cost: 200 },
            ])

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setSearch('chalk'))
            expect(result.current.filteredItems).toHaveLength(1)
            expect(result.current.filteredItems[0].item_name).toBe('Chalk')
        })

        it('filters items by item_code', async () => {
            mockApi.operations.getInventory.mockResolvedValue([
                { id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000 },
                { id: 2, item_name: 'Eraser', item_code: 'ERS001', unit_cost: 200 },
            ])

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setSearch('ERS'))
            expect(result.current.filteredItems).toHaveLength(1)
            expect(result.current.filteredItems[0].item_code).toBe('ERS001')
        })

        it('returns all items when search is empty', async () => {
            mockApi.operations.getInventory.mockResolvedValue([
                { id: 1, item_name: 'Chalk', item_code: 'CHK001', unit_cost: 5000 },
                { id: 2, item_name: 'Eraser', item_code: 'ERS001', unit_cost: 200 },
            ])

            const { result } = renderHook(() => useInventory())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.filteredItems).toHaveLength(2)
        })
    })
})
