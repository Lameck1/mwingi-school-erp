import { Eye, EyeOff } from 'lucide-react'
import React, { useState } from 'react'

interface PasswordFieldProps {
    id: string
    label: string
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
    required?: boolean
    disabled?: boolean
}

export function PasswordField({ id, label, value, onChange, placeholder, required, disabled }: Readonly<PasswordFieldProps>) {
    const [show, setShow] = useState(false)

    return (
        <div>
            <label className="label" htmlFor={id}>{label}</label>
            <div className="relative">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    className="input pr-10"
                    placeholder={placeholder}
                    required={required}
                    disabled={disabled}
                />
                <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                    aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                >
                    {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
            </div>
        </div>
    )
}
