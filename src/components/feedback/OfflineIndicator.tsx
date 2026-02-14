import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [dbError, setDbError] = useState<string | null>(null)
    const [retrying, setRetrying] = useState(false)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

            globalThis.addEventListener('online', handleOnline)
            globalThis.addEventListener('offline', handleOffline)

        // Listen for database errors from main process
        const unsubscribe = globalThis.electronAPI.menuEvents.onDatabaseError((message) => {
            setDbError(message)
        })

        return () => {
                globalThis.removeEventListener('online', handleOnline)
                globalThis.removeEventListener('offline', handleOffline)
            unsubscribe()
        }
    }, [])

    const handleRetry = async () => {
        setRetrying(true)
        setTimeout(() => {
            setRetrying(false)
                globalThis.location.reload()
        }, 1000)
    }

    if (isOnline && !dbError) {return null}

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
            {!isOnline && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/90 text-white rounded-xl shadow-lg backdrop-blur-sm">
                    <WifiOff className="w-5 h-5" />
                    <div>
                        <p className="font-bold text-sm">You're Offline</p>
                        <p className="text-xs opacity-80">Some features may be limited</p>
                    </div>
                </div>
            )}

            {dbError && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-500/90 text-white rounded-xl shadow-lg backdrop-blur-sm mt-2">
                    <AlertTriangle className="w-5 h-5" />
                    <div className="flex-1">
                        <p className="font-bold text-sm">Database Error</p>
                        <p className="text-xs opacity-80">{dbError}</p>
                    </div>
                    <button
                        onClick={handleRetry}
                        disabled={retrying}
                        title="Retry database connection"
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            )}
        </div>
    )
}
