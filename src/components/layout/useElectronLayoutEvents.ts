import { useEffect } from 'react'

import { printCurrentView } from '../../utils/print'

import type { useToast } from '../../contexts/ToastContext'
import type { UpdateStatus } from '../../types/electron-api'
import type { useNavigate } from 'react-router-dom'

export function useElectronLayoutEvents(
    navigate: ReturnType<typeof useNavigate>,
    showToast: ReturnType<typeof useToast>['showToast']
) {
    useEffect(() => {
        const unsubscribeNavigate = globalThis.electronAPI.menuEvents.onNavigate((path) => navigate(path))
        const unsubscribePrint = globalThis.electronAPI.menuEvents.onTriggerPrint(() => printCurrentView({ title: 'Page Print Preview' }))
        const unsubscribeImport = globalThis.electronAPI.menuEvents.onOpenImportDialog(() => navigate('/students?import=1'))
        const unsubscribeBackup = globalThis.electronAPI.menuEvents.onBackupDatabase((filePath) => {
            void (async () => {
                try {
                    const result = await globalThis.electronAPI.system.createBackupTo(filePath)
                    showToast(result.success ? 'Backup saved successfully' : 'Backup failed', result.success ? 'success' : 'error')
                } catch (error) {
                    showToast(error instanceof Error ? error.message : 'Backup failed', 'error')
                }
            })()
        })
        const unsubscribeCheckUpdates = globalThis.electronAPI.menuEvents.onCheckForUpdates(() => {
            globalThis.electronAPI.system.checkForUpdates().catch((error) => {
                showToast(error instanceof Error ? error.message : 'Update check failed', 'error')
            })
        })
        const unsubscribeUpdateStatus = globalThis.electronAPI.menuEvents.onUpdateStatus((data: UpdateStatus) => {
            if (data.status === 'available') { showToast(`Update available: v${data.version}`, 'info'); return }
            if (data.status === 'downloading') { showToast(`Downloading update: ${data.progress}%`, 'info'); return }
            if (data.status === 'downloaded') { showToast(`Update ready: v${data.version}`, 'success'); return }
            if (data.status === 'error') { showToast(data.error, 'error'); return }
            if (data.status === 'not-available') { showToast('No updates available', 'info') }
        })
        const unsubscribeDbError = globalThis.electronAPI.menuEvents.onDatabaseError((message) => showToast(message, 'error'))

        return () => {
            unsubscribeNavigate()
            unsubscribePrint()
            unsubscribeImport()
            unsubscribeBackup()
            unsubscribeCheckUpdates()
            unsubscribeUpdateStatus()
            unsubscribeDbError()
        }
    }, [navigate, showToast])
}
