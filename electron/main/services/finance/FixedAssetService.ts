import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface FixedAsset {
    id: number
    asset_code: string
    asset_name: string
    category_id: number
    description: string | null
    serial_number: string | null
    location: string | null
    acquisition_date: string
    acquisition_cost: number
    current_value: number
    accumulated_depreciation: number
    status: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF' | 'TRANSFERRED'
    disposed_date: string | null
    disposed_value: number | null
    disposal_reason: string | null
    supplier_id: number | null
    warranty_expiry: string | null
    last_depreciation_date: string | null
    created_by_user_id: number
    created_at: string
    updated_at: string
    // Computed
    category_name?: string
}

export interface CreateAssetData {
    asset_name: string
    category_id: number
    acquisition_date: string
    acquisition_cost: number
    asset_code?: string
    description?: string
    serial_number?: string
    location?: string
    supplier_id?: number
    warranty_expiry?: string
}

export interface AssetFilters {
    category_id?: number
    status?: FixedAsset['status']
    search?: string
}

export interface UpdateAssetData extends Partial<CreateAssetData> {
    status?: FixedAsset['status']
}

export class FixedAssetService extends BaseService<FixedAsset, CreateAssetData, UpdateAssetData, AssetFilters> {
    protected getTableName(): string { return 'fixed_asset' }
    protected getPrimaryKey(): string { return 'id' }
    protected getTableAlias(): string { return 'fa' }

    protected buildSelectQuery(): string {
        return `
            SELECT fa.*, ac.category_name 
            FROM fixed_asset fa
            LEFT JOIN asset_category ac ON fa.category_id = ac.id
        `
    }

    protected mapRowToEntity(row: any): FixedAsset {
        return row as FixedAsset
    }

    protected validateCreate(data: CreateAssetData): string[] | null {
        const errors: string[] = []
        if (!data.asset_name) errors.push('Asset name is required')
        if (!data.category_id) errors.push('Category is required')
        if (!data.acquisition_date) errors.push('Acquisition date is required')
        if (data.acquisition_cost < 0) errors.push('Cost cannot be negative')
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(id: number, data: UpdateAssetData): Promise<string[] | null> {
        return null
    }

    protected executeCreate(data: CreateAssetData): { lastInsertRowid: number | bigint } {
        // Auto-generate asset code if not provided
        const assetCode = data.asset_code || `AST-${Date.now().toString().slice(-6)}`

        return this.db.prepare(`
            INSERT INTO fixed_asset (
                asset_code, asset_name, category_id, description, serial_number,
                location, acquisition_date, acquisition_cost, current_value, 
                accumulated_depreciation, status, supplier_id, warranty_expiry,
                created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?, ?, ?)
        `).run(
            assetCode, data.asset_name, data.category_id, data.description || null,
            data.serial_number || null, data.location || null, data.acquisition_date,
            data.acquisition_cost, data.acquisition_cost, // Initial current value = cost
            data.supplier_id || null, data.warranty_expiry || null,
            1 // TODO: Pass user ID
        )
    }

    protected executeUpdate(id: number, data: UpdateAssetData): void {
        const sets: string[] = []
        const params: any[] = []

        if (data.asset_name) { sets.push('asset_name = ?'); params.push(data.asset_name) }
        if (data.category_id) { sets.push('category_id = ?'); params.push(data.category_id) }
        if (data.location) { sets.push('location = ?'); params.push(data.location) }
        if (data.status) { sets.push('status = ?'); params.push(data.status) }

        if (sets.length > 0) {
            params.push(id)
            this.db.prepare(`UPDATE fixed_asset SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params)
        }
    }

    protected applyFilters(filters: AssetFilters, conditions: string[], params: any[]): void {
        if (filters.category_id) {
            conditions.push('fa.category_id = ?')
            params.push(filters.category_id)
        }
        if (filters.status) {
            conditions.push('fa.status = ?')
            params.push(filters.status)
        }
        if (filters.search) {
            conditions.push('(fa.asset_name LIKE ? OR fa.asset_code LIKE ?)')
            params.push(`%${filters.search}%`, `%${filters.search}%`)
        }
        conditions.push('fa.deleted_at IS NULL')
    }

    // Custom Methods

    async runDepreciation(assetId: number, periodId: number, userId: number): Promise<{ success: boolean; error?: string }> {
        const asset = await this.findById(assetId)
        if (!asset) return { success: false, error: 'Asset not found' }
        if (asset.current_value <= 0) return { success: false, error: 'Asset already fully depreciated' }

        // Simple Straight Line Depreciation (10% default for now)
        // In real app, fetch rate from category
        const rate = 0.10
        const depreciationAmount = Math.round(asset.acquisition_cost * rate)

        const newAccumulated = asset.accumulated_depreciation + depreciationAmount
        const newValue = Math.max(0, asset.current_value - depreciationAmount)

        this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO asset_depreciation (
                    asset_id, depreciation_date, amount, book_value_before, 
                    book_value_after, financial_period_id
                ) VALUES (?, CURRENT_DATE, ?, ?, ?, ?)
            `).run(assetId, depreciationAmount, asset.current_value, newValue, periodId)

            this.db.prepare(`
                UPDATE fixed_asset 
                SET current_value = ?, accumulated_depreciation = ?, last_depreciation_date = CURRENT_DATE 
                WHERE id = ?
            `).run(newValue, newAccumulated, assetId)
        })()

        logAudit(userId, 'DEPRECIATION', 'fixed_asset', assetId, { value: asset.current_value }, { value: newValue })

        return { success: true }
    }
}
