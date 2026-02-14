import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
    return (
        <div className="bg-red-500 text-white px-4 py-1 text-xs font-bold text-center flex items-center justify-center gap-2 animate-in slide-in-from-top">
            <WifiOff className="w-3 h-3" />
            <span>OFFLINE MODE: Cloud features (Email/SMS) are unavailable. Local features work normally.</span>
        </div>
    )
}
