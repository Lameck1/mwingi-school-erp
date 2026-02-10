import {
    AlertTriangle,
    Download,
    FileSpreadsheet,
    Loader2,
    Upload,
    X
} from 'lucide-react'
import React, { useRef, useState } from 'react'

import { Modal } from './Modal'
import { useAuthStore } from '../../stores'

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

const SUPPORTED_FILE_PATTERN = /\.(csv|xlsx|xls)$/i

function isSupportedFile(fileName: string): boolean {
    return SUPPORTED_FILE_PATTERN.test(fileName)
}

function mapTemplateToMappings(template: ImportTemplate): ImportMapping[] {
    return template.columns.map((column) => ({
        sourceColumn: column.name,
        targetField: column.name.toLowerCase().replace(/\s+/g, '_'),
        required: column.required
    }))
}

async function fetchTemplateMappings(entityType: string): Promise<ImportMapping[]> {
    const template = await window.electronAPI.getImportTemplate(entityType) as ImportTemplate
    return mapTemplateToMappings(template)
}

interface UploadStepProps {
    fileInputRef: React.RefObject<HTMLInputElement>
    onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
    onDownloadTemplate: () => Promise<void>
}

function UploadStep({ fileInputRef, onFileSelect, onDownloadTemplate }: Readonly<UploadStepProps>) {
    const openPicker = () => fileInputRef.current?.click()

    return (
        <div className="space-y-4">
            <div
                className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center hover:border-primary/50 transition-colors cursor-pointer bg-white/5"
                onClick={openPicker}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        openPicker()
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-primary" />
                <p className="font-medium text-white mb-1">Click to upload CSV or Excel</p>
                <p className="text-sm text-foreground/50">or drag and drop here</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={onFileSelect}
                    aria-label="Upload CSV or Excel file"
                />
            </div>

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
    file: File
    error: string | null
    onCancel: () => void
    onImport: () => Promise<void>
}

function ReviewStep({ file, error, onCancel, onImport }: Readonly<ReviewStepProps>) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                        <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="font-medium text-white">{file.name}</p>
                        <p className="text-xs text-foreground/50">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                </div>
                <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded-full text-foreground/50" aria-label="Remove file">
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
            <h3 className="text-lg font-bold text-white mb-2">Processing Data...</h3>
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
                <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                    <p className="text-sm text-foreground/50 mb-1">Total Rows</p>
                    <p className="text-2xl font-bold text-white">{importResult.totalRows}</p>
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
                        {importResult.errors.map((errorItem, index) => (
                            <div key={index} className="px-4 py-2 text-xs text-red-300">
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
    fileInputRef: React.RefObject<HTMLInputElement>
    step: ImportStep
    file: File | null
    error: string | null
    importResult: ImportResult | null
    handleClose: () => void
    handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
    handleDownloadTemplate: () => Promise<void>
    handleImport: () => Promise<void>
    reset: () => void
}

function useImportDialogController(
    entityType: string,
    onClose: () => void,
    onSuccess: (result: unknown) => void
): ImportDialogController {
    const { user } = useAuthStore()
    const [step, setStep] = useState<ImportStep>('UPLOAD')
    const [file, setFile] = useState<File | null>(null)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setFile(null)
        setStep('UPLOAD')
        setImportResult(null)
        setError(null)
    }

    return {
        fileInputRef,
        step,
        file,
        error,
        importResult,
        reset,
        handleClose: () => {
            reset()
            onClose()
        },
        handleFileSelect: (event) => {
            const selected = event.target.files?.[0]
            if (!selected) { return }
            if (!isSupportedFile(selected.name)) {
                setError('Please select a valid CSV or Excel file')
                return
            }
            setFile(selected)
            setError(null)
            setStep('REVIEW')
        },
        handleDownloadTemplate: async () => {
            try {
                const result = await window.electronAPI.downloadImportTemplate(entityType)
                if (result.success) { alert(`Template downloaded to: ${result.filePath}`) }
            } catch (downloadError) {
                console.error(downloadError)
                alert('Failed to download template')
            }
        },
        handleImport: async () => {
            if (!file) { return }
            if (!user?.id) { setError('You must be signed in to import data'); return }
            setStep('IMPORTING')
            try {
                const mappings = await fetchTemplateMappings(entityType)
                const config = { entityType, mappings, skipDuplicates: true, duplicateKey: entityType === 'STUDENT' ? 'admission_number' : 'id' }
                const importResponse = await window.electronAPI.importData((file as File & { path: string }).path, config, user.id)
                const result = importResponse as ImportResult
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
        return <UploadStep fileInputRef={controller.fileInputRef} onFileSelect={controller.handleFileSelect} onDownloadTemplate={controller.handleDownloadTemplate} />
    }
    if (controller.step === 'REVIEW' && controller.file) {
        return <ReviewStep file={controller.file} error={controller.error} onCancel={controller.reset} onImport={controller.handleImport} />
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
