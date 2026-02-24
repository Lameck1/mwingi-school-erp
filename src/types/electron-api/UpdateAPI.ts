export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string | string[] }
  | { status: 'not-available' }
  | { status: 'downloading'; progress: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; error: string }

export type UpdateCommandResult =
  | { success: true; message?: string }
  | { success: false; error: string }

export interface UpdateAPI {
  checkForUpdates: () => Promise<UpdateCommandResult>
  downloadUpdate: () => Promise<UpdateCommandResult>
  installUpdate: () => Promise<UpdateCommandResult>
  getUpdateStatus: () => Promise<{
    isAvailable: boolean
    downloadProgress: number
    status?: 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    reason?: string
  }>
}
