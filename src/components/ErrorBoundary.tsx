import React from 'react'

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: React.ErrorInfo | null
}

interface ErrorBoundaryProps {
    children: React.ReactNode
    fallback?: React.ReactNode
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

/**
 * Enhanced ErrorBoundary with error reporting and recovery mechanisms
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    private retryCount = 0
    private maxRetries = 3

    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error }
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        this.setState({ errorInfo })

        // Log to console in development
        console.error('ErrorBoundary caught:', error, errorInfo)

        // Report to main process for logging
        const api = window.electronAPI

        const logErrorFn = api.system.logError
        if (typeof logErrorFn === 'function') {
            // eslint-disable-next-line promise/no-promise-in-callback
            void logErrorFn({
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                timestamp: new Date().toISOString()
            }).catch(e => console.error('Failed to log error to main process:', e))
        }

        // Call custom error handler if provided
        this.props.onError?.(error, errorInfo)
    }

    handleReset = (): void => {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++
            this.setState({ hasError: false, error: null, errorInfo: null })
        } else {
            // Max retries reached, offer full page reload
            window.location.reload()
        }
    }

    handleReload = (): void => {
        window.location.reload()
    }

    override render(): React.JSX.Element {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return <>{this.props.fallback}</>
            }

            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
                    <div className="text-red-600 mb-4">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-foreground dark:text-gray-100 mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-muted-foreground dark:text-muted-foreground mb-4 max-w-md">
                        {this.state.error ? this.state.error.message : 'An unexpected error occurred'}
                    </p>

                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={this.handleReset}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors"
                            disabled={this.retryCount >= this.maxRetries}
                        >
                            {this.retryCount >= this.maxRetries ? 'Max Retries Reached' : `Try Again (${this.retryCount}/${this.maxRetries})`}
                        </button>

                        {this.retryCount >= this.maxRetries && (
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                            >
                                Reload Application
                            </button>
                        )}
                    </div>

                    {import.meta.env.DEV && this.state.errorInfo && (
                        <details className="mt-4 text-left text-xs text-gray-500 max-w-2xl">
                            <summary className="cursor-pointer hover:text-gray-700">Error Details (Development)</summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto">
                                {this.state.error ? this.state.error.stack : ''}\n\n{this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    )}
                </div>
            )
        }

        return <>{this.props.children}</>
    }
}
