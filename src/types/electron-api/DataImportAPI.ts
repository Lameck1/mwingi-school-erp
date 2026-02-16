export interface DataImportAPI {
  importData: (filePath: string, config: unknown, userId: number) => Promise<{ success: boolean; totalRows: number; imported: number; skipped: number; errors: Array<{ row: number; message: string }> }>
  getImportTemplate: (entityType: string) => Promise<{ columns: { name: string; required: boolean }[] }>
  downloadImportTemplate: (entityType: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
}
