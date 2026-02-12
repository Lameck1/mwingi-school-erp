interface SkeletonProps {
    className?: string
}

export function Skeleton({ className = '' }: Readonly<SkeletonProps>) {
    return (
        <div
            className={`animate-pulse bg-secondary/50 rounded ${className}`}
            aria-hidden="true"
        />
    )
}
