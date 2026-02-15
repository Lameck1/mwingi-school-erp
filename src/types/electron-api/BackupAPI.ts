export interface BackupAPI {
  createBackup: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
  createBackupTo: (filePath: string) => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
  restoreBackup: (filename: string) => Promise<{ success: boolean; message?: string; cancelled?: boolean }>
  getBackupList: () => Promise<Array<{ filename: string; size: number; created_at: Date }>>
  openBackupFolder: () => Promise<{ success: boolean }>
  logError: (data: { error: string; stack?: string; componentStack?: string | null; timestamp: string }) => Promise<void>
}
