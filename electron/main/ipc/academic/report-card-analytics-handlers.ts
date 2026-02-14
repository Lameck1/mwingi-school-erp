import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

const getService = () => container.resolve('ReportCardAnalyticsService')

interface ReportCardAnalyticsPayload {
  exam_id: number
  stream_id: number
  threshold?: number
}

export function registerReportCardAnalyticsHandlers() {
  safeHandleRaw('report-card-analytics:getPerformanceSummary', async (_event, payload: ReportCardAnalyticsPayload) => {
    try {
      return await getService().getPerformanceSummary(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in performance summary handler:', error)
      throw error
    }
  })

  safeHandleRaw('report-card-analytics:getGradeDistribution', async (_event, payload: ReportCardAnalyticsPayload) => {
    try {
      return await getService().getGradeDistribution(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in grade distribution handler:', error)
      throw error
    }
  })

  safeHandleRaw('report-card-analytics:getSubjectPerformance', async (_event, payload: ReportCardAnalyticsPayload) => {
    try {
      return await getService().getSubjectPerformance(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in subject performance handler:', error)
      throw error
    }
  })

  safeHandleRaw('report-card-analytics:getStrugglingStudents', async (_event, payload: ReportCardAnalyticsPayload) => {
    try {
      return await getService().getStrugglingStu(
        payload.exam_id,
        payload.stream_id,
        payload.threshold || 50
      )
    } catch (error) {
      console.error('Error in struggling students handler:', error)
      throw error
    }
  })

  safeHandleRaw('report-card-analytics:getTermComparison', async (_event, payload: ReportCardAnalyticsPayload) => {
    try {
      return await getService().getTermComparison(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in term comparison handler:', error)
      throw error
    }
  })
}
