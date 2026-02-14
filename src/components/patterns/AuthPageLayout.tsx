import React from 'react'

interface AuthPageLayoutProps {
    title: string
    subtitle: string
    children: React.ReactNode
    cardTitle: string
    error?: string
}

export function AuthPageLayout({ title, subtitle, children, cardTitle, error }: Readonly<AuthPageLayoutProps>) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-card rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                        <span className="text-3xl font-bold text-blue-600">MAS</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">{title}</h1>
                    <p className="text-blue-200 mt-1">{subtitle}</p>
                </div>

                <div className="bg-card rounded-2xl shadow-2xl p-4 md:p-8">
                    <h2 className="text-xl font-semibold text-foreground text-center mb-6">{cardTitle}</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {children}
                </div>

                <p className="text-center text-blue-200 text-sm mt-6">
                    &copy; {new Date().getFullYear()} Mwingi Adventist School
                </p>
            </div>
        </div>
    )
}
