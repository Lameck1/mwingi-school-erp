import React from 'react'

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

interface ErrorBoundaryProps {
    children: React.ReactNode
    fallback?: React.ReactNode
}

/**
 * ErrorBoundary catches render-time exceptions in the React tree and
 * shows a recovery UI instead of white-screening the entire app.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('ErrorBoundary caught:', error, errorInfo)
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null })
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }
            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
                    <div className="text-red-600 mb-4">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        onClick={this.handleReset}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
