import React, { Suspense } from 'react'

import { ErrorBoundary } from '../ErrorBoundary'

interface SuspenseRouteProps {
    children: React.ReactNode
}

/**
 * Per-route wrapper combining ErrorBoundary + Suspense.
 * Isolates lazy-loaded route failures so they don't crash the whole app.
 */
export function SuspenseRoute({ children }: Readonly<SuspenseRouteProps>) {
    return (
        <ErrorBoundary>
            <Suspense fallback={
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
            }>
                {children}
            </Suspense>
        </ErrorBoundary>
    )
}
