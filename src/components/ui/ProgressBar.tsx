import { useEffect, useRef } from 'react'

import { cn } from '../../utils/cn.js'

interface ProgressBarProps {
    /** Percentage value 0–100 */
    value: number
    /** Tailwind classes for the fill bar (color, gradient) */
    fillClass?: string
    /** Tailwind height class */
    height?: string
    /** Tailwind classes for the track background */
    trackClass?: string
    /** Additional classes on the track container */
    className?: string
}

/**
 * A progress bar that uses a CSS custom property (`--bar-w`) set via ref
 * to avoid inline `style=` attributes in JSX.
 */
export function ProgressBar({
    value,
    fillClass = 'bg-primary',
    height = 'h-2',
    trackClass = 'bg-secondary',
    className,
}: Readonly<ProgressBarProps>) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        ref.current?.style.setProperty('--bar-w', `${Math.min(Math.max(value, 0), 100)}%`)
    }, [value])

    return (
        <div ref={ref} className={cn('rounded-full overflow-hidden', height, trackClass, className)}>
            <div className={cn('h-full bar-fill', fillClass)} />
        </div>
    )
}
