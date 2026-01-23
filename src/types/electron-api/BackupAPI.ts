export interface BackupAPI {
  createBackup: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
  restoreBackup: () => Promise<{ success: boolean; message?: string; cancelled?: boolean }>
}