export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string | string[] }
  | { status: 'not-available' }
  | { status: 'downloading'; progress: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; error: string }

export interface UpdateAPI {
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  getUpdateStatus: () => Promise<{ isAvailable: boolean; downloadProgress: number }>
}
