interface SkeletonProps {
    className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-white/5 rounded ${className}`}
            aria-hidden="true"
        />
    )
}
