import { useState, useEffect } from 'react'

export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(globalThis.navigator.onLine)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        globalThis.addEventListener('online', handleOnline)
        globalThis.addEventListener('offline', handleOffline)

        return () => {
            globalThis.removeEventListener('online', handleOnline)
            globalThis.removeEventListener('offline', handleOffline)
        }
    }, [])

    return isOnline
}
