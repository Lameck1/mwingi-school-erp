import { Printer, X } from 'lucide-react'
import React from 'react'

import { closePrintPreview, subscribePrintPreview, type PrintPreviewData } from '../../utils/print'
import { Modal } from '../ui/Modal'

export function PrintPreviewHost() {
    const [preview, setPreview] = React.useState<PrintPreviewData | null>(null)
    const frameRef = React.useRef<HTMLIFrameElement | null>(null)

    React.useEffect(() => subscribePrintPreview(setPreview), [])

    const handleClose = React.useCallback(() => {
        closePrintPreview()
    }, [])

    const handlePrint = React.useCallback(() => {
        const frameWindow = frameRef.current?.contentWindow
        if (!frameWindow) {return}
        frameWindow.focus()
        frameWindow.print()
    }, [])

    return (
        <Modal
            isOpen={Boolean(preview)}
            onClose={handleClose}
            title={preview ? `${preview.title} - Print Preview` : 'Print Preview'}
            size="print"
        >
            {preview ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-end gap-3 print-only-hide">
                        <button
                            onClick={handlePrint}
                            className="btn btn-primary flex items-center gap-2 px-5"
                        >
                            <Printer className="w-4 h-4" />
                            <span>Print Document</span>
                        </button>
                        <button
                            onClick={handleClose}
                            className="btn btn-secondary flex items-center gap-2 px-5"
                        >
                            <X className="w-4 h-4" />
                            <span>Close</span>
                        </button>
                    </div>
                    <div className="border border-border/30 rounded-xl overflow-hidden bg-card">
                        <iframe
                            ref={frameRef}
                            title={preview.title}
                            srcDoc={preview.html}
                            sandbox="allow-same-origin allow-modals"
                            className="w-full h-[72vh] bg-card"
                        />
                    </div>
                </div>
            ) : null}
        </Modal>
    )
}
