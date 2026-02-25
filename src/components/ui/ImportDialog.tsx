import {
    AlertTriangle,
    Download,
    FileSpreadsheet,
    Loader2,
    Upload,
    X
} from 'lucide-react'
import { useState } from 'react'

import { Modal } from './Modal'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../stores'
import { getIPCFailureMessage, isIPCFailure, unwrapIPCResult } from '../../utils/ipc'
import { reportRuntimeError } from '../../utils/runtimeError'

interface ImportDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (result: unknown) => void
    entityType: string
    title?: string
}

type ImportStep = 'UPLOAD' | 'REVIEW' | 'IMPORTING' | 'RESULT'

interface ImportResult {
    success: boolean
    totalRows: number
    imported: number
    skipped: number
    errors: Array<{ row: number; message: string }>
}

interface ImportTemplate {
    columns: Array<{ name: string; required: boolean }>
}

interface ImportMapping {
    sourceColumn: string
    targetField: string
    required: boolean
}

const IMPORT_ENTITY_TYPES = new Set(['STUDENT', 'STAFF', 'FEE_STRUCTURE', 'INVENTORY', 'BANK_STATEMENT'] as const)

const SUPPORTED_FILE_PATTERN = /\.(csv|xlsx|xls)$/i

function isSupportedFile(fileName: string): boolean {
    return SUPPORTED_FILE_PATTERN.test(fileName)
}

function mapTemplateToMappings(template: ImportTemplate): ImportMapping[] {
    return template.columns.map((column) => ({
        sourceColumn: column.name,
        targetField: column.name.toLowerCase().replaceAll(/\s+/g, '_'),
        required: column.required
    }))
}

async function fetchTemplateMappings(entityType: string): Promise<ImportMapping[]> {
    const template = unwrapIPCResult<ImportTemplate>(
        await globalThis.electronAPI.system.getImportTemplate(entityType),
        'Failed to load import template metadata'
    )
    return mapTemplateToMappings(template)
}

function normalizeImportResult(payload: unknown): ImportResult {
    if (
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as { success?: unknown }).success === 'boolean' &&
        typeof (payload as { totalRows?: unknown }).totalRows === 'number' &&
        typeof (payload as { imported?: unknown }).imported === 'number' &&
        typeof (payload as { skipped?: unknown }).skipped === 'number' &&
        Array.isArray((payload as { errors?: unknown }).errors)
    ) {
        const rawErrors = (payload as { errors: unknown[] }).errors
        const errors = rawErrors
            .filter((item): item is { row?: unknown; message?: unknown } =>
                typeof item === 'object' && item !== null
            )
            .map((item) => ({
                row: typeof item.row === 'number' ? item.row : 0,
                message: typeof item.message === 'string' ? item.message : 'Unknown import error'
            }))
        return {
            success: (payload as { success: boolean }).success,
            totalRows: (payload as { totalRows: number }).totalRows,
            imported: (payload as { imported: number }).imported,
            skipped: (payload as { skipped: number }).skipped,
            errors
        }
    }

    if (isIPCFailure(payload)) {
        return {
            success: false,
            totalRows: 0,
            imported: 0,
            skipped: 0,
            errors: [{ row: 0, message: getIPCFailureMessage(payload, 'Import failed') }]
        }
    }

    return {
        success: false,
        totalRows: 0,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, message: 'Import failed due to unexpected response shape' }]
    }
}

interface UploadStepProps {
    onPickFile: () => Promise<void>
    onDownloadTemplate: () => Promise<void>
}

function UploadStep({ onPickFile, onDownloadTemplate }: Readonly<UploadStepProps>) {
    return (
        <div className="space-y-4">
            <button
                type="button"
                className="w-full border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/50 transition-colors cursor-pointer bg-secondary/50"
                onClick={() => {
                    void onPickFile()
                }}
            >
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-primary" />
                <p className="font-medium text-foreground mb-1">Select CSV or Excel file</p>
                <p className="text-sm text-foreground/50">A secure import token will be created in the main process</p>
            </button>

            <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-blue-400" />
                    <div>
                        <p className="text-sm font-medium text-blue-100">Need a template?</p>
                        <p className="text-xs text-blue-300">Download a pre-formatted Excel file</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        void onDownloadTemplate()
                    }}
                    className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-md text-sm font-medium transition-colors"
                >
                    Download
                </button>
            </div>
        </div>
    )
}

interface ReviewStepProps {
    fileName: string
    fileSizeBytes: number
    error: string | null
    onCancel: () => void
    onImport: () => Promise<void>
}

function ReviewStep({ fileName, fileSizeBytes, error, onCancel, onImport }: Readonly<ReviewStepProps>) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                        <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="font-medium text-foreground">{fileName}</p>
                        <p className="text-xs text-foreground/50">{(fileSizeBytes / 1024).toFixed(1)} KB</p>
                    </div>
                </div>
                <button onClick={onCancel} className="p-1 hover:bg-secondary rounded-full text-foreground/50" aria-label="Remove file">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
                <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
                <button
                    onClick={() => {
                        void onImport()
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Upload className="w-4 h-4" />
                    Import Now
                </button>
            </div>
        </div>
    )
}

function ImportingStep() {
    return (
        <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">Processing Data...</h3>
            <p className="text-sm text-foreground/50">Please wait while we validate and import your records.</p>
        </div>
    )
}

interface ResultStepProps {
    importResult: ImportResult
    onDone: () => void
}

function ResultStep({ importResult, onDone }: Readonly<ResultStepProps>) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-secondary/50 rounded-lg text-center border border-border">
                    <p className="text-sm text-foreground/50 mb-1">Total Rows</p>
                    <p className="text-2xl font-bold text-foreground">{importResult.totalRows}</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg text-center border border-green-500/20">
                    <p className="text-sm text-green-400 mb-1">Imported</p>
                    <p className="text-2xl font-bold text-green-400">{importResult.imported}</p>
                </div>
                <div className="p-4 bg-amber-500/10 rounded-lg text-center border border-amber-500/20">
                    <p className="text-sm text-amber-400 mb-1">Skipped</p>
                    <p className="text-2xl font-bold text-amber-400">{importResult.skipped}</p>
                </div>
            </div>

            {importResult.errors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/10 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/10 font-medium text-red-400 text-sm">
                        Errors ({importResult.errors.length})
                    </div>
                    <div className="max-h-32 overflow-y-auto divide-y divide-red-500/10">
                        {importResult.errors.map((errorItem) => (
                            <div key={`${errorItem.row}-${errorItem.message}`} className="px-4 py-2 text-xs text-red-300">
                                Row {errorItem.row}: {errorItem.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-center pt-2">
                <button onClick={onDone} className="btn btn-primary min-w-[120px]">
                    Done
                </button>
            </div>
        </div>
    )
}

interface ImportDialogController {
    step: ImportStep
    selectedImportFile: { token: string; fileName: string; fileSizeBytes: number } | null
    error: string | null
    importResult: ImportResult | null
    handleClose: () => void
    handlePickFile: () => Promise<void>
    handleDownloadTemplate: () => Promise<void>
    handleImport: () => Promise<void>
    reset: () => void
}

// eslint-disable-next-line max-lines-per-function
function useImportDialogController(
    entityType: string,
    onClose: () => void,
    onSuccess: (result: unknown) => void
): ImportDialogController {
    const { user } = useAuthStore()
    const { showToast } = useToast()
    const [step, setStep] = useState<ImportStep>('UPLOAD')
    const [selectedImportFile, setSelectedImportFile] = useState<{ token: string; fileName: string; fileSizeBytes: number } | null>(null)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setSelectedImportFile(null)
        setStep('UPLOAD')
        setImportResult(null)
        setError(null)
    }

    return {
        step,
        selectedImportFile,
        error,
        importResult,
        reset,
        handleClose: () => {
            reset()
            onClose()
        },
        handlePickFile: async () => {
            try {
                const pickResult = await globalThis.electronAPI.system.pickImportFile()
                if (!pickResult.success) {
                    if (!pickResult.cancelled && pickResult.error) {
                        setError(pickResult.error)
                    }
                    return
                }
                if (!pickResult.token || !pickResult.fileName || !pickResult.fileSizeBytes) {
                    setError('File selection response was incomplete')
                    return
                }
                if (!isSupportedFile(pickResult.fileName)) {
                    setError('Please select a valid CSV or Excel file')
                    return
                }

                setSelectedImportFile({
                    token: pickResult.token,
                    fileName: pickResult.fileName,
                    fileSizeBytes: pickResult.fileSizeBytes
                })
                setError(null)
                setStep('REVIEW')
            } catch (pickError) {
                setError(pickError instanceof Error ? pickError.message : 'Failed to select import file')
            }
        },
        handleDownloadTemplate: async () => {
            try {
                const result = await globalThis.electronAPI.system.downloadImportTemplate(entityType)
                if (result.success) {
                    showToast(
                        result.filePath ? `Template downloaded to: ${result.filePath}` : 'Template downloaded successfully',
                        'success'
                    )
                } else {
                    showToast(result.error || 'Failed to download template', 'error')
                }
            } catch (downloadError) {
                showToast(
                    reportRuntimeError(downloadError, { area: 'ImportDialog', action: 'downloadTemplate' }, 'Failed to download template'),
                    'error'
                )
            }
        },
        handleImport: async () => {
            if (!selectedImportFile) { return }
            if (!user?.id) { setError('You must be signed in to import data'); return }
            if (!IMPORT_ENTITY_TYPES.has(entityType as 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'INVENTORY' | 'BANK_STATEMENT')) {
                setError(`Unsupported import entity type: ${entityType}`)
                setStep('REVIEW')
                return
            }
            setStep('IMPORTING')
            try {
                const mappings = await fetchTemplateMappings(entityType)
                const normalizedEntityType = entityType as 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'INVENTORY' | 'BANK_STATEMENT'
                const config = {
                    entityType: normalizedEntityType,
                    mappings,
                    skipDuplicates: true,
                    duplicateKey: normalizedEntityType === 'STUDENT' ? 'admission_number' : 'id'
                }
                const importResponse = await globalThis.electronAPI.system.importData(selectedImportFile.token, config, user.id)
                const result = normalizeImportResult(importResponse)
                setImportResult(result)
                setStep('RESULT')
                if (result.success) { onSuccess(result) }
            } catch (importError) {
                setError(importError instanceof Error ? importError.message : 'Import failed')
                setStep('REVIEW')
            }
        }
    }
}

interface ImportDialogStepContentProps {
    controller: ImportDialogController
}

function ImportDialogStepContent({ controller }: Readonly<ImportDialogStepContentProps>) {
    if (controller.step === 'UPLOAD') {
        return <UploadStep onPickFile={controller.handlePickFile} onDownloadTemplate={controller.handleDownloadTemplate} />
    }
    if (controller.step === 'REVIEW' && controller.selectedImportFile) {
        return (
            <ReviewStep
                fileName={controller.selectedImportFile.fileName}
                fileSizeBytes={controller.selectedImportFile.fileSizeBytes}
                error={controller.error}
                onCancel={controller.reset}
                onImport={controller.handleImport}
            />
        )
    }
    if (controller.step === 'IMPORTING') {
        return <ImportingStep />
    }
    if (controller.step === 'RESULT' && controller.importResult) {
        return <ResultStep importResult={controller.importResult} onDone={controller.handleClose} />
    }
    return null
}

export function ImportDialog({
    isOpen,
    onClose,
    onSuccess,
    entityType,
    title = 'Import Data'
}: Readonly<ImportDialogProps>) {
    const controller = useImportDialogController(entityType, onClose, onSuccess)

    return (
        <Modal isOpen={isOpen} onClose={controller.handleClose} title={title}>
            <div className="space-y-6">
                <ImportDialogStepContent controller={controller} />
            </div>
        </Modal>
    )
}
