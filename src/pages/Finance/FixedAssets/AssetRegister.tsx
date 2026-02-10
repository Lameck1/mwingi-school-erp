import {
    Plus, Search, Filter
} from 'lucide-react'
import React, { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type FixedAsset, type CreateAssetData } from '../../../types/electron-api/FixedAssetAPI'
import { formatCurrencyFromCents, formatDate, shillingsToCents } from '../../../utils/format'

export default function AssetRegister() {
    const { user } = useAuthStore()
    const { showToast } = useToast()
    const [assets, setAssets] = useState<FixedAsset[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [createForm, setCreateForm] = useState<CreateAssetData>({
        asset_name: '',
        category_id: 0,
        acquisition_date: new Date().toISOString().slice(0, 10),
        acquisition_cost: 0,
        description: '',
        serial_number: '',
        location: ''
    })

    // Mock categories for now - typically fetched from API
    // In a real implementation, we'd have a getCategories endpoint
    const categories = [
        { id: 1, name: 'Furniture & Fittings' },
        { id: 2, name: 'Computer Equipment' },
        { id: 3, name: 'Vehicles' },
        { id: 4, name: 'Land & Buildings' }
    ]

    const loadAssets = useCallback(async (searchQuery: string) => {
        setLoading(true)
        try {
            const data = await globalThis.electronAPI.getAssets({ search: searchQuery })
            setAssets(data)
        } catch (error) {
            console.error('Failed to load assets', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadAssets('').catch((err: unknown) => console.error('Failed to load assets', err))
    }, [loadAssets])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user?.id) {
            showToast('You must be signed in to create assets', 'error')
            return
        }
        try {
            const result = await globalThis.electronAPI.createAsset({
                ...createForm,
                acquisition_cost: shillingsToCents(createForm.acquisition_cost), // Whole currency units -> cents
            }, user.id)

            if (result.success) {
                setShowCreateModal(false)
                setCreateForm({
                    asset_name: '',
                    category_id: 0,
                    acquisition_date: new Date().toISOString().slice(0, 10),
                    acquisition_cost: 0,
                    description: '',
                    serial_number: '',
                    location: ''
                })
                loadAssets(search).catch((err: unknown) => console.error('Failed to reload assets', err))
            } else {
                alert('Failed to create asset: ' + result.errors?.join(', '))
            }
        } catch {
            alert('Error creating asset')
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Fixed Asset Register"
                subtitle="Manage school properties and equipment"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Fixed Assets' }]}
                actions={
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Register Asset
                    </button>
                }
            />

            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadAssets(search)}
                        placeholder="Search assets..."
                        className="input pl-11 bg-secondary/30"
                    />
                </div>
                <button className="btn btn-secondary px-4" aria-label="Filter assets">
                    <Filter className="w-4 h-4" />
                </button>
            </div>

            <div className="card no-scrollbar overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-white/5">
                            <th className="px-4 py-4">Asset Details</th>
                            <th className="px-4 py-4">Category</th>
                            <th className="px-4 py-4">Location</th>
                            <th className="px-4 py-4">Acquired</th>
                            <th className="px-4 py-4 text-right">Cost</th>
                            <th className="px-4 py-4 text-right">Current Value</th>
                            <th className="px-4 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {assets.map((asset) => (
                            <tr key={asset.id} className="group hover:bg-white/[0.02]">
                                <td className="px-4 py-4">
                                    <p className="font-bold text-white">{asset.asset_name}</p>
                                    <p className="text-[10px] text-foreground/40 font-mono">{asset.asset_code}</p>
                                </td>
                                <td className="px-4 py-4 text-sm text-foreground/70">{asset.category_name || '-'}</td>
                                <td className="px-4 py-4 text-sm text-foreground/70">{asset.location || '-'}</td>
                                <td className="px-4 py-4 text-sm text-foreground/70">{formatDate(asset.acquisition_date)}</td>
                                <td className="px-4 py-4 text-right font-mono text-sm">{formatCurrencyFromCents(asset.acquisition_cost)}</td>
                                <td className="px-4 py-4 text-right font-bold text-white font-mono">{formatCurrencyFromCents(asset.current_value)}</td>
                                <td className="px-4 py-4">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${asset.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
                                        }`}>
                                        {asset.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {assets.length === 0 && !loading && (
                            <tr>
                                <td colSpan={7} className="py-12 text-center text-foreground/40">
                                    No assets found. Register your first asset.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Register New Asset"
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="field-172" className="label">Asset Name</label>
                        <input id="field-172"
                            type="text"
                            value={createForm.asset_name}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, asset_name: e.target.value }))}
                            className="input"
                            required
                            aria-label="Asset name"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="field-184" className="label">Category</label>
                            <select id="field-184"
                                value={createForm.category_id}
                                onChange={(e) => setCreateForm(prev => ({ ...prev, category_id: Number(e.target.value) }))}
                                className="input"
                                required
                                aria-label="Asset category"
                            >
                                <option value={0}>Select Category</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="field-197" className="label">Acquisition Cost</label>
                            <input id="field-197"
                                type="number"
                                value={createForm.acquisition_cost || ''}
                                onChange={(e) => setCreateForm(prev => ({ ...prev, acquisition_cost: Number(e.target.value) }))}
                                className="input"
                                required
                                min="0"
                                aria-label="Acquisition cost"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="field-211" className="label">Date Acquired</label>
                            <input id="field-211"
                                type="date"
                                value={createForm.acquisition_date}
                                onChange={(e) => setCreateForm(prev => ({ ...prev, acquisition_date: e.target.value }))}
                                className="input"
                                required
                                aria-label="Date acquired"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="field-222" className="label">Location</label>
                            <input id="field-222"
                                type="text"
                                value={createForm.location || ''}
                                onChange={(e) => setCreateForm(prev => ({ ...prev, location: e.target.value }))}
                                className="input"
                                placeholder="e.g. Computer Lab"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="field-233" className="label">Serial Number</label>
                        <input id="field-233"
                            type="text"
                            value={createForm.serial_number || ''}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, serial_number: e.target.value }))}
                            className="input"
                            aria-label="Serial number"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Save Asset
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
