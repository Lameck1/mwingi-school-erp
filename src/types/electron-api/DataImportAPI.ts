export interface ImportMapping {
  sourceColumn: string
  targetField: string
  required?: boolean
}

export interface ImportConfig {
  entityType: 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'INVENTORY' | 'BANK_STATEMENT'
  mappings: ImportMapping[]
  skipDuplicates?: boolean
  duplicateKey?: string
}

export interface ImportResult {
  success: boolean
  totalRows: number
  imported: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

export interface PickImportFileResult {
  success: boolean
  cancelled?: boolean
  token?: string
  fileName?: string
  fileSizeBytes?: number
  extension?: string
  expiresAtMs?: number
  error?: string
}

export interface DataImportAPI {
  pickImportFile: () => Promise<PickImportFileResult>
  importData: (fileToken: string, config: ImportConfig, userId: number) => Promise<ImportResult>
  getImportTemplate: (entityType: string) => Promise<{ columns: { name: string; required: boolean }[] }>
  downloadImportTemplate: (entityType: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
}
