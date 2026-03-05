import { type HireAsset } from '../../../types/electron-api/HireAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

interface AssetsTableProps {
    readonly assets: HireAsset[]
}

export function AssetsTable({ assets }: AssetsTableProps) {
    return (
        <table className="min-w-full divide-y divide-border">
            <thead className="bg-secondary">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Asset Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Default Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Rate Type</th>
                </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
                {assets.map((asset) => (
                    <tr key={asset.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{asset.asset_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.asset_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{formatCurrencyFromCents(asset.default_rate || 0)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.rate_type || 'MANUAL'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
