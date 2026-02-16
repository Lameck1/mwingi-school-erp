import { container } from '../../services/base/ServiceContainer'
import { ROLES, safeHandleRawWithRole } from '../ipc-result'

const getService = () => container.resolve('ReportCardAnalyticsService')

interface ReportCardAnalyticsPayload {
  exam_id: number
  stream_id: number
  threshold?: number
}

export function registerReportCardAnalyticsHandlers() {
  safeHandleRawWithRole('report-card-analytics:getPerformanceSummary', ROLES.STAFF, async (_event, payload: ReportCardAnalyticsPayload) => {
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

  safeHandleRawWithRole('report-card-analytics:getGradeDistribution', ROLES.STAFF, async (_event, payload: ReportCardAnalyticsPayload) => {
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

  safeHandleRawWithRole('report-card-analytics:getSubjectPerformance', ROLES.STAFF, async (_event, payload: ReportCardAnalyticsPayload) => {
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

  safeHandleRawWithRole('report-card-analytics:getStrugglingStudents', ROLES.STAFF, async (_event, payload: ReportCardAnalyticsPayload) => {
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

  safeHandleRawWithRole('report-card-analytics:getTermComparison', ROLES.STAFF, async (_event, payload: ReportCardAnalyticsPayload) => {
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
