export interface FixedAsset {
    id: number
    asset_code: string
    asset_name: string
    category_id: number
    description?: string
    serial_number?: string
    location?: string
    acquisition_date: string
    acquisition_cost: number
    current_value: number
    accumulated_depreciation: number
    status: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF' | 'TRANSFERRED'
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

export interface AssetCategory {
    id: number
    category_name: string
    depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE'
    useful_life_years: number
    depreciation_rate: number | null
}

export interface FinancialPeriod {
    id: number
    period_name: string
    start_date: string
    end_date: string
    is_locked: boolean
}

export interface FixedAssetAPI {
    getAssetCategories: () => Promise<AssetCategory[]>
    getFinancialPeriods: () => Promise<FinancialPeriod[]>
    getAssets: (filters?: AssetFilters) => Promise<FixedAsset[]>
    getAsset: (id: number) => Promise<FixedAsset | null>
    createAsset: (data: CreateAssetData) => Promise<{ success: boolean; id: number; errors?: string[] }>
    updateAsset: (id: number, data: Partial<CreateAssetData> & { status?: string }) => Promise<{ success: boolean; errors?: string[] }>
    runDepreciation: (assetId: number, periodId: number) => Promise<{ success: boolean; error?: string }>
}
