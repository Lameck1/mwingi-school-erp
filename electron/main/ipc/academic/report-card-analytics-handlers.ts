import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import { ReportCardAnalyticsPayloadSchema } from '../schemas/academic-schemas'
import { validatedHandler } from '../validated-handler'

const getService = () => container.resolve('ReportCardAnalyticsService')

interface ReportCardAnalyticsPayload {
  exam_id: number
  stream_id: number
  threshold?: number
}

export function registerReportCardAnalyticsHandlers() {
  validatedHandler('report-card-analytics:getPerformanceSummary', ROLES.STAFF, ReportCardAnalyticsPayloadSchema, async (_event, payload: ReportCardAnalyticsPayload) => {
    return await getService().getPerformanceSummary(
      payload.exam_id,
      payload.stream_id
    )
  })

  validatedHandler('report-card-analytics:getGradeDistribution', ROLES.STAFF, ReportCardAnalyticsPayloadSchema, async (_event, payload: ReportCardAnalyticsPayload) => {
    return await getService().getGradeDistribution(
      payload.exam_id,
      payload.stream_id
    )
  })

  validatedHandler('report-card-analytics:getSubjectPerformance', ROLES.STAFF, ReportCardAnalyticsPayloadSchema, async (_event, payload: ReportCardAnalyticsPayload) => {
    return await getService().getSubjectPerformance(
      payload.exam_id,
      payload.stream_id
    )
  })

  validatedHandler('report-card-analytics:getStrugglingStudents', ROLES.STAFF, ReportCardAnalyticsPayloadSchema, async (_event, payload: ReportCardAnalyticsPayload) => {
    return await getService().getStrugglingStu(
      payload.exam_id,
      payload.stream_id,
      payload.threshold || 50
    )
  })

  validatedHandler('report-card-analytics:getTermComparison', ROLES.STAFF, ReportCardAnalyticsPayloadSchema, async (_event, payload: ReportCardAnalyticsPayload) => {
    return await getService().getTermComparison(
      payload.exam_id,
      payload.stream_id
    )
  })
}
