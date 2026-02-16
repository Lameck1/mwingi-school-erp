import { Clock, PlayCircle, TrendingDown } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { canRunDepreciation, getDefaultPeriodId, getUnlockedPeriods } from './depreciation.logic'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore, useAppStore } from '../../../stores'
import { type FinancialPeriod, type FixedAsset } from '../../../types/electron-api/FixedAssetAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

export default function Depreciation() {
    const { user } = useAuthStore()
    const { currentAcademicYear } = useAppStore()
    const { showToast } = useToast()
    const [assets, setAssets] = useState<FixedAsset[]>([])
    const [periods, setPeriods] = useState<FinancialPeriod[]>([])
    const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
    const [assetToConfirm, setAssetToConfirm] = useState<FixedAsset | null>(null)
    const [processing, setProcessing] = useState<number | null>(null)

    const loadAssets = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getAssets({ status: 'ACTIVE' })
            setAssets(data)
        } catch (error) {
            console.error('Failed to load assets', error)
            showToast('Failed to load fixed assets', 'error')
        }
    }, [showToast])

    const loadPeriods = useCallback(async () => {
        try {
            const allPeriods = await globalThis.electronAPI.getFinancialPeriods()
            const unlocked = getUnlockedPeriods(allPeriods)
            setPeriods(unlocked)
            setSelectedPeriodId((current) => current ?? getDefaultPeriodId(unlocked))
        } catch (error) {
            console.error('Failed to load periods', error)
            showToast('Failed to load financial periods', 'error')
        }
    }, [showToast])

    useEffect(() => {
        void loadAssets()
        void loadPeriods()
    }, [loadAssets, loadPeriods])

    const openDepreciationModal = (asset: FixedAsset) => {
        const validation = canRunDepreciation(user?.id, selectedPeriodId)
        if (!validation.allowed) {
            showToast(validation.reason || 'Cannot run depreciation', 'error')
            return
        }
        setAssetToConfirm(asset)
    }

    const closeDepreciationModal = () => {
        if (processing) {
            return
        }
        setAssetToConfirm(null)
    }

    const handleRunDepreciation = async () => {
        if (!assetToConfirm || !selectedPeriodId || !user?.id) {
            showToast('Missing depreciation context', 'error')
            return
        }

        setProcessing(assetToConfirm.id)
        try {
            const result = await globalThis.electronAPI.runDepreciation(assetToConfirm.id, selectedPeriodId, user.id)

            if (result.success) {
                showToast(`Depreciation posted for ${assetToConfirm.asset_name}`, 'success')
                setAssetToConfirm(null)
                void loadAssets()
                void loadPeriods()
            } else {
                showToast(result.error || 'Depreciation failed', 'error')
            }
        } catch {
            showToast('Error processing depreciation', 'error')
        } finally {
            setProcessing(null)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Asset Depreciation"
                subtitle="Manage asset value reduction over time"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Fixed Assets' }, { label: 'Depreciation' }]}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="premium-card bg-emerald-500/10 border-emerald-500/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground/60 uppercase tracking-wider">Total Book Value</p>
                            <h3 className="text-2xl font-bold text-foreground font-mono">
                                {formatCurrencyFromCents(assets.reduce((sum, a) => sum + a.current_value, 0))}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-foreground">Active Assets</h3>
                    <div className="text-sm text-foreground/50">Current Period: {currentAcademicYear?.year_name || 'N/A'}</div>
                </div>

                <div className="no-scrollbar overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border/20">
                                <th className="px-4 py-4">Asset</th>
                                <th className="px-4 py-4">Category</th>
                                <th className="px-4 py-4 text-right">Original Cost</th>
                                <th className="px-4 py-4 text-right">Accum. Depr.</th>
                                <th className="px-4 py-4 text-right">Book Value</th>
                                <th className="px-4 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {assets.map((asset) => (
                                <tr key={asset.id} className="group hover:bg-white/[0.02]">
                                    <td className="px-4 py-4">
                                        <div className="font-bold text-foreground">{asset.asset_name}</div>
                                        <div className="text-[10px] text-foreground/40 font-mono">{asset.asset_code}</div>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-foreground/70">{asset.category_name}</td>
                                    <td className="px-4 py-4 text-right font-mono text-sm text-foreground/60">{formatCurrencyFromCents(asset.acquisition_cost)}</td>
                                    <td className="px-4 py-4 text-right font-mono text-sm text-amber-400/80">
                                        {formatCurrencyFromCents(asset.accumulated_depreciation)}
                                    </td>
                                    <td className="px-4 py-4 text-right font-mono font-bold text-foreground">
                                        {formatCurrencyFromCents(asset.current_value)}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <button
                                            onClick={() => openDepreciationModal(asset)}
                                            disabled={!!processing || asset.current_value === 0}
                                            className="btn btn-secondary py-1 px-3 text-xs flex items-center gap-2 mx-auto disabled:opacity-50"
                                            title="Run depreciation in selected period"
                                        >
                                            {processing === asset.id ? <Clock className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                                            Run
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={!!assetToConfirm}
                onClose={closeDepreciationModal}
                title="Confirm Depreciation Run"
                size="sm"
            >
                {assetToConfirm && (
                    <div className="space-y-4">
                        <p className="text-sm text-foreground/70">
                            Post depreciation for <span className="font-semibold text-foreground">{assetToConfirm.asset_name}</span>.
                        </p>
                        <div className="space-y-2">
                            <label htmlFor="depreciation-period" className="label">Financial Period</label>
                            <select
                                id="depreciation-period"
                                className="input"
                                value={selectedPeriodId ?? ''}
                                onChange={(event) => {
                                    const value = Number(event.target.value)
                                    setSelectedPeriodId(Number.isFinite(value) && value > 0 ? value : null)
                                }}
                            >
                                {periods.length === 0 && <option value="">No unlocked periods available</option>}
                                {periods.map((period) => (
                                    <option key={period.id} value={period.id}>
                                        {period.period_name} ({period.start_date} to {period.end_date})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={closeDepreciationModal}
                                disabled={processing === assetToConfirm.id}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => { void handleRunDepreciation() }}
                                disabled={processing === assetToConfirm.id || !selectedPeriodId}
                            >
                                {processing === assetToConfirm.id ? 'Processing...' : 'Run Depreciation'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
