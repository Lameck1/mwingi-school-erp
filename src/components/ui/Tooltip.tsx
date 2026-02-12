import React, { useEffect, useId, useRef, useState } from 'react'

import { cn } from '../../utils/cn'

interface TooltipProps {
    content: string
    children: React.ReactNode
    position?: 'top' | 'bottom' | 'left' | 'right'
    className?: string
    delay?: number
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

const mergeHandler = <E extends React.SyntheticEvent>(
    handler: () => void,
    childHandler?: (event: E) => void
) => (event: E) => {
    handler()
    childHandler?.(event)
}

const renderFallbackTrigger = (
    tooltipId: string,
    showTooltip: () => void,
    hideTooltip: () => void,
    children: React.ReactNode
) => {
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            showTooltip()
        }
        if (event.key === 'Escape') {
            hideTooltip()
        }
    }

    return (
        <button
            className="inline-flex bg-transparent border-0 padding-0 cursor-pointer"
            aria-describedby={tooltipId}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
            onKeyDown={handleKeyDown}
        >
            {children}
        </button>
    )
}

const renderClonedTrigger = (
    children: React.ReactElement,
    tooltipId: string,
    showTooltip: () => void,
    hideTooltip: () => void
) => {
    const childProps = children.props as React.HTMLAttributes<HTMLElement>
    const describedBy = childProps['aria-describedby']
        ? `${childProps['aria-describedby']} ${tooltipId}`
        : tooltipId

    return React.cloneElement(children, {
        onMouseEnter: mergeHandler(showTooltip, childProps.onMouseEnter),
        onMouseLeave: mergeHandler(hideTooltip, childProps.onMouseLeave),
        onFocus: mergeHandler(showTooltip, childProps.onFocus),
        onBlur: mergeHandler(hideTooltip, childProps.onBlur),
        'aria-describedby': describedBy
    })
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
    const animateInRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const animateOutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const tooltipId = useId()

    const clearAllTimers = () => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
        if (animateInRef.current) { clearTimeout(animateInRef.current); animateInRef.current = null }
        if (animateOutRef.current) { clearTimeout(animateOutRef.current); animateOutRef.current = null }
    }

    useEffect(() => clearAllTimers, [])

    const showTooltip = () => {
        if (animateOutRef.current) { clearTimeout(animateOutRef.current); animateOutRef.current = null }
        timeoutRef.current = setTimeout(() => {
            setShouldRender(true)
            // Small delay to trigger animation
            animateInRef.current = setTimeout(() => setIsVisible(true), 10)
        }, delay)
    }

    const hideTooltip = () => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
        if (animateInRef.current) { clearTimeout(animateInRef.current); animateInRef.current = null }
        setIsVisible(false)
        // Wait for animation to finish before unmounting
        animateOutRef.current = setTimeout(() => setShouldRender(false), 150)
    }

    const trigger = React.isValidElement(children)
        ? renderClonedTrigger(children, tooltipId, showTooltip, hideTooltip)
        : renderFallbackTrigger(tooltipId, showTooltip, hideTooltip, children)

    return (
        <div
            className="relative inline-block w-full"
        >
            {trigger}
            {shouldRender && (
                <div
                    className={cn(
                        "absolute z-[100] px-3 py-1.5 text-[11px] font-bold text-foreground bg-card/95 border border-border/40 backdrop-blur-xl rounded-md whitespace-nowrap shadow-2xl transition-all duration-200 pointer-events-none",
                        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95",
                        positionClasses[position],
                        className
                    )}
                    id={tooltipId}
                    role="tooltip"
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
