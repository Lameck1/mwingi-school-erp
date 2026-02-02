export interface BackupAPI {
  createBackup: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
  restoreBackup: (filename: string) => Promise<{ success: boolean; message?: string; cancelled?: boolean }>
  getBackupList: () => Promise<Array<{ filename: string; size: number; created_at: Date }>>
}