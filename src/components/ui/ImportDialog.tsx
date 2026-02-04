import React, { useState, useRef } from 'react'
import {
    Upload, Download, AlertTriangle,
    FileSpreadsheet, Loader2, X
} from 'lucide-react'
import { Modal } from './Modal'

interface ImportDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (result: unknown) => void
    entityType: string
    title?: string
}

export function ImportDialog({
    isOpen,
    onClose,
    onSuccess,
    entityType,
    title = 'Import Data'
}: ImportDialogProps) {
    const [step, setStep] = useState<'UPLOAD' | 'REVIEW' | 'IMPORTING' | 'RESULT'>('UPLOAD')
    const [file, setFile] = useState<File | null>(null)
    const [importResult, setImportResult] = useState<unknown>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0]
        if (selected) {
            if (!selected.name.match(/\.(csv|xlsx|xls)$/i)) {
                setError('Please select a valid CSV or Excel file')
                return
            }
            setFile(selected)
            setError(null)
            setStep('REVIEW')
        }
    }

    const handleDownloadTemplate = async () => {
        try {
            const result = await window.electronAPI.downloadImportTemplate(entityType)
            if (result.success) {
                alert(`Template downloaded to: ${result.filePath}`)
            }
        } catch (err) {
            console.error(err)
            alert('Failed to download template')
        }
    }

    const handleImport = async () => {
        if (!file) return

        setStep('IMPORTING')
        try {
            // In Electron context, we need the file path, but browsers don't give it.
            // So we use the FileReader API or send the file buffer?
            // Since we are in Electron renderer, File object has 'path' property

            const config = {
                entityType,
                mappings: await window.electronAPI.getImportTemplate(entityType).then((t: unknown) =>
                    t.columns.map((c: unknown) => ({
                        sourceColumn: c.name,
                        targetField: c.name.toLowerCase().replace(/\s+/g, '_'), // Naive mapping
                        required: c.required
                    }))
                ),
                skipDuplicates: true,
                duplicateKey: entityType === 'STUDENT' ? 'admission_number' : 'id'
            }

            const result = await window.electronAPI.importData((file as unknown).path, config, 1) // TODO: User ID
            setImportResult(result)
            setStep('RESULT')

            if (result.success) {
                onSuccess(result)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed')
            setStep('REVIEW')
        }
    }

    const reset = () => {
        setFile(null)
        setStep('UPLOAD')
        setImportResult(null)
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={title}>
            <div className="space-y-6">

                {step === 'UPLOAD' && (
                    <div className="space-y-4">
                        <div
                            className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center hover:border-primary/50 transition-colors cursor-pointer bg-white/5"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-primary" />
                            <p className="font-medium text-white mb-1">Click to upload CSV or Excel</p>
                            <p className="text-sm text-foreground/50">or drag and drop here</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                className="hidden"
                                onChange={handleFileSelect}
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
                                onClick={handleDownloadTemplate}
                                className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-md text-sm font-medium transition-colors"
                            >
                                Download
                            </button>
                        </div>
                    </div>
                )}

                {step === 'REVIEW' && file && (
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
                            <button onClick={reset} className="p-1 hover:bg-white/10 rounded-full text-foreground/50" aria-label="Remove file">
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
                            <button onClick={reset} className="btn btn-secondary">Cancel</button>
                            <button onClick={handleImport} className="btn btn-primary flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Import Now
                            </button>
                        </div>
                    </div>
                )}

                {step === 'IMPORTING' && (
                    <div className="py-12 text-center">
                        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">Processing Data...</h3>
                        <p className="text-sm text-foreground/50">Please wait while we validate and import your records.</p>
                    </div>
                )}

                {step === 'RESULT' && importResult && (
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

                        {importResult.errors?.length > 0 && (
                            <div className="bg-red-500/5 border border-red-500/10 rounded-lg overflow-hidden">
                                <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/10 font-medium text-red-400 text-sm">
                                    Errors ({importResult.errors.length})
                                </div>
                                <div className="max-h-32 overflow-y-auto divide-y divide-red-500/10">
                                    {importResult.errors.map((err: unknown, i: number) => (
                                        <div key={i} className="px-4 py-2 text-xs text-red-300">
                                            Row {err.row}: {err.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-center pt-2">
                            <button onClick={handleClose} className="btn btn-primary min-w-[120px]">
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    )
}

