export interface RuntimeErrorContext {
    area: string
    action: string
}

export function toErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }
    if (typeof error === 'string' && error.trim()) {
        return error
    }
    return fallback
}

function safeSerializeError(error: unknown): string {
    try {
        return JSON.stringify(error)
    } catch {
        return String(error)
    }
}

export function reportRuntimeError(
    error: unknown,
    context: RuntimeErrorContext,
    fallbackMessage: string,
): string {
    const message = toErrorMessage(error, fallbackMessage)
    const composed = `[${context.area}] ${context.action}: ${message}`

    console.error(composed, error)

    const electronApi = (globalThis as {
        electronAPI?: {
            system?: {
                logError?: (data: { error: string; stack?: string; componentStack?: string | null; timestamp: string }) => Promise<unknown>
            }
        }
    }).electronAPI

    const logError = electronApi?.system?.logError
    if (typeof logError === 'function') {
        void logError({
            error: composed,
            stack: error instanceof Error ? error.stack : safeSerializeError(error),
            timestamp: new Date().toISOString()
        })
    }

    return message
}
