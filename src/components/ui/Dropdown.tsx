import React, { useState, useRef, useEffect } from 'react'

interface DropdownItem {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    variant?: 'default' | 'danger'
}

interface DropdownProps {
    trigger: React.ReactNode
    items: DropdownItem[]
    align?: 'left' | 'right'
}

export function Dropdown({ trigger, items, align = 'right' }: Readonly<DropdownProps>) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative" ref={containerRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        setIsOpen(!isOpen)
                    }
                }}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
            >
                {trigger}
            </div>

            {isOpen && (
                <div
                    className={`absolute top-full mt-2 z-[100] min-w-[160px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300 ${align === 'right' ? 'right-0' : 'left-0'}`}
                >
                    <div className="py-1">
                        {items.map((item, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    item.onClick()
                                    setIsOpen(false)
                                }}
                                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors duration-200 hover:bg-secondary ${item.variant === 'danger' ? 'text-red-400' : 'text-foreground/80'}`}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
