import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { BaseService } from '../base/BaseService'

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

export interface AssetCategory {
    id: number
    category_name: string
    depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE'
    useful_life_years: number
    depreciation_rate: number | null
    is_active: number
}

export interface FinancialPeriod {
    id: number
    period_name: string
    start_date: string
    end_date: string
    is_locked: number
}

export class FixedAssetService extends BaseService<FixedAsset, CreateAssetData, UpdateAssetData, AssetFilters> {
    protected getTableName(): string { return 'fixed_asset' }
    protected getPrimaryKey(): string { return 'id' }
    protected override getTableAlias(): string { return 'fa' }

    protected buildSelectQuery(): string {
        return `
            SELECT fa.*, ac.category_name 
            FROM fixed_asset fa
            LEFT JOIN asset_category ac ON fa.category_id = ac.id
        `
    }

    protected mapRowToEntity(row: unknown): FixedAsset {
        return row as FixedAsset
    }

    protected validateCreate(data: CreateAssetData): string[] | null {
        const errors: string[] = []
        if (!data.asset_name) {errors.push('Asset name is required')}
        if (!data.category_id) {errors.push('Category is required')}
        if (!data.acquisition_date) {errors.push('Acquisition date is required')}
        if (data.acquisition_cost <= 0) {errors.push('Acquisition cost must be greater than zero')}
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(_id: number, _data: UpdateAssetData): Promise<string[] | null> {
        return null
    }

    override async create(data: CreateAssetData, userId: number): Promise<{ success: boolean; id: number; errors?: string[] }> {
        const errors = this.validateCreate(data)
        if (errors) {
            return { success: false, id: 0, errors }
        }

        try {
            const result = this.executeCreateWithUser(data, userId)
            const id = result.lastInsertRowid as number
            logAudit(userId, 'CREATE', this.getTableName(), id, null, data)

            // GL journal entry: Debit Fixed Asset, Credit Cash/AP
            const journalService = new DoubleEntryJournalService(this.db)
            journalService.createJournalEntrySync({
                entry_date: new Date().toISOString().split('T')[0] ?? '',
                entry_type: 'ASSET_ACQUISITION',
                description: `Acquisition: ${data.asset_name} (${data.asset_code})`,
                created_by_user_id: userId,
                lines: [
                    {
                        gl_account_code: '1200',
                        debit_amount: data.acquisition_cost,
                        credit_amount: 0,
                        description: 'Fixed asset'
                    },
                    {
                        gl_account_code: '1100',
                        debit_amount: 0,
                        credit_amount: data.acquisition_cost,
                        description: 'Cash/AP'
                    }
                ]
            })

            return { success: true, id }
        } catch (error) {
            return {
                success: false,
                id: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            }
        }
    }

    protected executeCreate(data: CreateAssetData): { lastInsertRowid: number | bigint } {
        // Fallback (BaseService) - should not be used directly
        return this.executeCreateWithUser(data, 0)
    }

    private executeCreateWithUser(data: CreateAssetData, userId: number): { lastInsertRowid: number | bigint } {
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
            data.acquisition_cost, data.acquisition_cost,
            data.supplier_id || null, data.warranty_expiry || null,
            userId
        )
    }

    protected executeUpdate(id: number, data: UpdateAssetData): void {
        const sets: string[] = []
        const params: unknown[] = []

        if (data.asset_name) { sets.push('asset_name = ?'); params.push(data.asset_name) }
        if (data.category_id) { sets.push('category_id = ?'); params.push(data.category_id) }
        if (data.location) { sets.push('location = ?'); params.push(data.location) }
        if (data.status) { sets.push('status = ?'); params.push(data.status) }

        if (sets.length > 0) {
            params.push(id)
            this.db.prepare(`UPDATE fixed_asset SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params)
        }
    }

    protected override applyFilters(filters: AssetFilters, conditions: string[], params: unknown[]): void {
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

    async getCategories(): Promise<AssetCategory[]> {
        return this.db.prepare(`
            SELECT id, category_name, depreciation_method, useful_life_years, depreciation_rate, is_active
            FROM asset_category
            WHERE is_active = 1
            ORDER BY category_name
        `).all() as AssetCategory[]
    }

    async getFinancialPeriods(): Promise<FinancialPeriod[]> {
        return this.db.prepare(`
            SELECT id, period_name, start_date, end_date, is_locked
            FROM financial_period
            ORDER BY end_date DESC
        `).all() as FinancialPeriod[]
    }

    async runDepreciation(assetId: number, periodId: number, userId: number): Promise<{ success: boolean; error?: string }> {
        const asset = await this.findById(assetId)
        if (!asset) {return { success: false, error: 'Asset not found' }}
        if (asset.current_value <= 0) {return { success: false, error: 'Asset already fully depreciated' }}

        const category = this.db.prepare(`
            SELECT depreciation_method, useful_life_years, depreciation_rate
            FROM asset_category
            WHERE id = ?
        `).get(asset.category_id) as { depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE'; useful_life_years: number; depreciation_rate: number | null } | undefined
        if (!category) {return { success: false, error: 'Asset category not found' }}

        const period = this.db.prepare(`
            SELECT id, is_locked
            FROM financial_period
            WHERE id = ?
        `).get(periodId) as { id: number; is_locked: number } | undefined
        if (!period) {return { success: false, error: 'Financial period not found' }}
        if (period.is_locked) {return { success: false, error: 'Financial period is locked' }}

        const existing = this.db.prepare(`
            SELECT id
            FROM asset_depreciation
            WHERE asset_id = ? AND financial_period_id = ?
        `).get(assetId, periodId) as { id: number } | undefined
        if (existing) {return { success: false, error: 'Depreciation already posted for this period' }}

        if (category.depreciation_method === 'NONE') {
            return { success: false, error: 'Selected asset category is non-depreciable' }
        }

        const categoryRate = category.depreciation_rate !== null
            ? category.depreciation_rate / 100
            : (category.useful_life_years > 0 ? 1 / category.useful_life_years : 0)
        if (categoryRate <= 0) {
            return { success: false, error: 'Invalid depreciation setup for asset category' }
        }

        const depreciationAmount = category.depreciation_method === 'DECLINING_BALANCE'
            ? Math.round(asset.current_value * categoryRate)
            : Math.round(asset.acquisition_cost * categoryRate)
        if (depreciationAmount <= 0) {return { success: false, error: 'Calculated depreciation amount is zero' }}

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

            // GL journal entry: Debit Depreciation Expense, Credit Accumulated Depreciation
            const journalService = new DoubleEntryJournalService(this.db)
            journalService.createJournalEntrySync({
                entry_date: new Date().toISOString().split('T')[0] ?? '',
                entry_type: 'DEPRECIATION',
                description: `Depreciation: ${asset.asset_name} (${asset.asset_code})`,
                created_by_user_id: userId,
                lines: [
                    {
                        gl_account_code: '5300',
                        debit_amount: depreciationAmount,
                        credit_amount: 0,
                        description: 'Depreciation expense'
                    },
                    {
                        gl_account_code: '1520',
                        debit_amount: 0,
                        credit_amount: depreciationAmount,
                        description: 'Accumulated depreciation'
                    }
                ]
            })
        })()

        logAudit(userId, 'DEPRECIATION', 'fixed_asset', assetId, { value: asset.current_value }, { value: newValue })

        return { success: true }
    }
}
