import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={`w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-foreground/20 ${className}`}
                {...props}
            />
        )
    }
)

Input.displayName = 'Input'
