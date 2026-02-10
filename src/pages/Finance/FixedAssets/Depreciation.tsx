import { Clock, PlayCircle, TrendingDown } from 'lucide-react'
import { useState, useEffect } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore, useAppStore } from '../../../stores'
import { type FixedAsset } from '../../../types/electron-api/FixedAssetAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

export default function Depreciation() {
    const { user } = useAuthStore()
    const { currentAcademicYear } = useAppStore()
    const { showToast } = useToast()
    const [assets, setAssets] = useState<FixedAsset[]>([])
    const [processing, setProcessing] = useState<number | null>(null)

    useEffect(() => {
        void loadAssets()
    }, [])

    const loadAssets = async () => {
        try {
            const data = await window.electronAPI.getAssets({ status: 'ACTIVE' })
            setAssets(data)
        } catch (error) {
            console.error('Failed to load assets', error)
        }
    }

    const handleRunDepreciation = async (asset: FixedAsset) => {
        if (!confirm(`Run depreciation for ${asset.asset_name}? This action cannot be undone.`)) {return}
        if (!user?.id) {
            showToast('You must be signed in to run depreciation', 'error')
            return
        }

        setProcessing(asset.id)
        try {
            // Using a dummy period ID = 1 for now if no period management exists in UI
            // Ideally should select a financial period
            const result = await window.electronAPI.runDepreciation(asset.id, 1, user.id)

            if (result.success) {
                alert('Depreciation posted successfully')
                void loadAssets()
            } else {
                alert('Failed: ' + result.error)
            }
        } catch {
            alert('Error processing depreciation')
        } finally {
            setProcessing(null)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Asset Depreciation"
                subtitle="Manage asset value reduction over time"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Fixed Assets' }, { label: 'Depreciation' }]}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="premium-card bg-emerald-500/10 border-emerald-500/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground/60 uppercase tracking-wider">Total Book Value</p>
                            <h3 className="text-2xl font-bold text-white font-mono">
                                {formatCurrencyFromCents(assets.reduce((sum, a) => sum + a.current_value, 0))}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white">Active Assets</h3>
                    <div className="text-sm text-foreground/50">Current Period: {currentAcademicYear?.year_name || 'N/A'}</div>
                </div>

                <div className="no-scrollbar overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-white/5">
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
                                        <div className="font-bold text-white">{asset.asset_name}</div>
                                        <div className="text-[10px] text-foreground/40 font-mono">{asset.asset_code}</div>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-foreground/70">{asset.category_name}</td>
                                    <td className="px-4 py-4 text-right font-mono text-sm text-foreground/60">{formatCurrencyFromCents(asset.acquisition_cost)}</td>
                                    <td className="px-4 py-4 text-right font-mono text-sm text-amber-400/80">
                                        {formatCurrencyFromCents(asset.accumulated_depreciation)}
                                    </td>
                                    <td className="px-4 py-4 text-right font-mono font-bold text-white">
                                        {formatCurrencyFromCents(asset.current_value)}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <button
                                            onClick={() => handleRunDepreciation(asset)}
                                            disabled={!!processing || asset.current_value === 0}
                                            className="btn btn-secondary py-1 px-3 text-xs flex items-center gap-2 mx-auto disabled:opacity-50"
                                            title="Run 10% Depreciation"
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
        </div>
    )
}
