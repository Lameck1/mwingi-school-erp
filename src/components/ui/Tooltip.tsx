import React, { useState, useRef } from 'react'

import { cn } from '../../utils/cn'

interface TooltipProps {
    content: string
    children: React.ReactNode
    position?: 'top' | 'bottom' | 'left' | 'right'
    className?: string
    delay?: number
}

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    position = 'top',
    className,
    delay = 200
}) => {
    const [isVisible, setIsVisible] = useState(false)
    const [shouldRender, setShouldRender] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            setShouldRender(true)
            // Small delay to trigger animation
            setTimeout(() => setIsVisible(true), 10)
        }, delay)
    }

    const hideTooltip = () => {
        if (timeoutRef.current) {clearTimeout(timeoutRef.current)}
        setIsVisible(false)
        // Wait for animation to finish before unmounting
        setTimeout(() => setShouldRender(false), 150)
    }

    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2'
    }

    const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-t-card/90',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-card/90',
        left: 'left-full top-1/2 -translate-y-1/2 border-l-card/90',
        right: 'right-full top-1/2 -translate-y-1/2 border-r-card/90'
    }

    return (
        <div
            className="relative inline-block w-full"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
        >
            {children}
            {shouldRender && (
                <div
                    className={cn(
                        "absolute z-[100] px-3 py-1.5 text-[11px] font-bold text-foreground bg-card/95 border border-border/40 backdrop-blur-xl rounded-md whitespace-nowrap shadow-2xl transition-all duration-200 pointer-events-none",
                        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95",
                        positionClasses[position],
                        className
                    )}
                >
                    {content}
                    {/* Tiny Arrow */}
                    <div className={cn(
                        "absolute border-4 border-transparent",
                        arrowClasses[position]
                    )} />
                </div>
            )}
        </div>
    )
}
