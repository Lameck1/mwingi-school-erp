import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../utils/cn.js'

interface SelectOption {
    value: string | number
    label: string
}

interface SelectProps {
    value: string | number
    onChange: (value: any) => void
    options: SelectOption[]
    placeholder?: string
    className?: string
    label?: string
    name?: string
}

export function Select({ value, onChange, options, placeholder = 'Select...', className, label }: SelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const selectedOption = options.find(opt => opt.value === value)

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
        <div className={cn("space-y-1.5", className)} ref={containerRef}>
            {label && <label className="text-xs font-bold text-foreground/60 px-1">{label}</label>}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "w-full flex items-center justify-between bg-secondary/30 border border-border/50 rounded-lg px-4 py-2.5 text-sm transition-[border-color,background-color,ring] duration-200",
                        "hover:bg-secondary/50 hover:border-border/80",
                        "focus:ring-1 focus:ring-primary/40 focus:border-primary/50 outline-none",
                        isOpen && "border-primary/50 ring-1 ring-primary/40"
                    )}
                >
                    <span className={cn(!selectedOption && "text-foreground/40")}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-foreground/40 transition-transform duration-300", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 transition-none">
                        <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
                            {options.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-foreground/40 italic">No options available</div>
                            ) : (
                                options.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            onChange(option.value)
                                            setIsOpen(false)
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-2 text-sm text-left transition-colors duration-200",
                                            "hover:bg-primary/20 hover:text-primary",
                                            option.value === value ? "bg-primary text-primary-foreground font-medium" : "text-foreground/80 hover:bg-secondary"
                                        )}
                                    >
                                        {option.label}
                                        {option.value === value && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
