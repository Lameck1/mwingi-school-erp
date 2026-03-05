import { AlertCircle, CheckCircle, Loader } from 'lucide-react'

import { ProgressBar } from '../../../components/ui/ProgressBar'

import type { GenerationProgress } from './ReportCardGeneration.types'

function renderProgressIcon(status: GenerationProgress['status']) {
    if (status === 'generating' || status === 'emailing') {
        return <Loader className="w-6 h-6 text-blue-500 animate-spin" />
    }

    if (status === 'complete') {
        return <CheckCircle className="w-6 h-6 text-green-500" />
    }

    return <AlertCircle className="w-6 h-6 text-red-500" />
}

interface GenerationProgressPanelProps {
    progress: GenerationProgress
}

export function GenerationProgressPanel({ progress }: Readonly<GenerationProgressPanelProps>) {
    const percentage = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100)
    let progressColor = 'bg-green-500'
    if (percentage < 33) { progressColor = 'bg-red-500' }
    else if (percentage < 66) { progressColor = 'bg-yellow-500' }

    return (
        <div className="bg-card rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              {renderProgressIcon(progress.status)}

              <div>
                <h3 className="font-semibold text-foreground">
                  {progress.status === 'generating' && 'Generating Report Cards...'}
                  {progress.status === 'emailing' && 'Sending Emails...'}
                  {progress.status === 'complete' && 'Complete!'}
                  {progress.status === 'error' && 'Error'}
                </h3>
                {progress.current_student && (
                  <p className="text-sm text-muted-foreground">
                    Current: {progress.current_student}
                  </p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Progress: {progress.completed} of {progress.total}</span>
                <span>{percentage}%</span>
              </div>
              <ProgressBar value={percentage} height="h-3" fillClass={`${progressColor} transition-all duration-300`} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-green-500/10 rounded p-3">
                <p className="text-muted-foreground">Generated</p>
                <p className="text-2xl font-bold text-green-600">{progress.completed}</p>
              </div>
              <div className="bg-red-500/10 rounded p-3">
                <p className="text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              </div>
              <div className="bg-blue-500/10 rounded p-3">
                <p className="text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-blue-600">{progress.total}</p>
              </div>
            </div>

            {progress.error_message && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                {progress.error_message}
              </div>
            )}
        </div>
    )
}
