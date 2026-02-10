import type { UpdateStatus } from './UpdateAPI'

export interface MenuEventAPI {
  onNavigate: (callback: (path: string) => void) => () => void
  onOpenImportDialog: (callback: () => void) => () => void
  onTriggerPrint: (callback: () => void) => () => void
  onBackupDatabase: (callback: (path: string) => void) => () => void
  onOpenCommandPalette: (callback: () => void) => () => void
  onCheckForUpdates: (callback: () => void) => () => void
  onUpdateStatus: (callback: (data: UpdateStatus) => void) => () => void
  onDatabaseError: (callback: (message: string) => void) => () => void
}
