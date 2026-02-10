import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { cn } from '../../utils/cn.js'

interface SelectOption {
    value: string | number
    label: string
}

interface SelectProps {
    value: string | number
    onChange: (value: string | number) => void
    options: SelectOption[]
    placeholder?: string
    className?: string
    label?: string
    name?: string
    id?: string
    'aria-label'?: string
}

interface SelectDropdownProps {
    isOpen: boolean
    options: SelectOption[]
    value: string | number
    onSelect: (value: string | number) => void
}

function SelectDropdown({ isOpen, options, value, onSelect }: Readonly<SelectDropdownProps>) {
    if (!isOpen) {
        return null
    }

    if (options.length === 0) {
        return (
            <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 transition-none">
                <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
                    <div className="px-4 py-3 text-sm text-foreground/40 italic">No options available</div>
                </div>
            </div>
        )
    }

    return (
        <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 transition-none">
            <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
                {options.map((option) => {
                    const isSelected = option.value === value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelect(option.value)}
                            className={cn(
                                'w-full flex items-center justify-between px-4 py-2 text-sm text-left transition-colors duration-200',
                                'hover:bg-primary/20 hover:text-primary',
                                isSelected ? 'bg-primary text-primary-foreground font-medium' : 'text-foreground/80 hover:bg-secondary'
                            )}
                        >
                            {option.label}
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function Select({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    className,
    label,
    id,
    'aria-label': ariaLabel
}: Readonly<SelectProps>) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const generatedId = useId()
    const selectId = id || `select-${generatedId}`
    const labelId = `${selectId}-label`
    const selectedOption = options.find(opt => opt.value === value)
    const selectedLabel = selectedOption ? selectedOption.label : placeholder

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleToggle = () => {
        setIsOpen((prev) => !prev)
    }

    const handleSelect = (selectedValue: string | number) => {
        onChange(selectedValue)
        setIsOpen(false)
    }

    return (
        <div className={cn("space-y-1.5", className)} ref={containerRef}>
            {label && (
                <label htmlFor={selectId} id={labelId} className="text-xs font-bold text-foreground/60 px-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <button
                    id={selectId}
                    type="button"
                    onClick={handleToggle}
                    aria-label={ariaLabel || label || placeholder}
                    aria-labelledby={label ? labelId : undefined}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                    className={cn(
                        "w-full flex items-center justify-between bg-secondary/30 border border-border/50 rounded-lg px-4 py-2.5 text-sm transition-[border-color,background-color,ring] duration-200",
                        "hover:bg-secondary/50 hover:border-border/80",
                        "focus:ring-1 focus:ring-primary/40 focus:border-primary/50 outline-none",
                        isOpen && "border-primary/50 ring-1 ring-primary/40"
                    )}
                >
                    <span className={cn(!selectedOption && "text-foreground/40")}>
                        {selectedLabel}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-foreground/40 transition-transform duration-300", isOpen && "rotate-180")} />
                </button>
                <SelectDropdown isOpen={isOpen} options={options} value={value} onSelect={handleSelect} />
            </div>
        </div>
    )
}

