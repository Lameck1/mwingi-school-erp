import { ipcMain } from '../../electron-env'
import ReportCardAnalyticsService from '../../services/academic/ReportCardAnalyticsService'

export function registerReportCardAnalyticsHandlers() {
  ipcMain.handle('report-card-analytics:getPerformanceSummary', async (_, payload) => {
    try {
      return await ReportCardAnalyticsService.getPerformanceSummary(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in performance summary handler:', error)
      throw error
    }
  })

  ipcMain.handle('report-card-analytics:getGradeDistribution', async (_, payload) => {
    try {
      return await ReportCardAnalyticsService.getGradeDistribution(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in grade distribution handler:', error)
      throw error
    }
  })

  ipcMain.handle('report-card-analytics:getSubjectPerformance', async (_, payload) => {
    try {
      return await ReportCardAnalyticsService.getSubjectPerformance(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in subject performance handler:', error)
      throw error
    }
  })

  ipcMain.handle('report-card-analytics:getStrugglingStudents', async (_, payload) => {
    try {
      return await ReportCardAnalyticsService.getStrugglingStu(
        payload.exam_id,
        payload.stream_id,
        payload.threshold || 50
      )
    } catch (error) {
      console.error('Error in struggling students handler:', error)
      throw error
    }
  })

  ipcMain.handle('report-card-analytics:getTermComparison', async (_, payload) => {
    try {
      return await ReportCardAnalyticsService.getTermComparison(
        payload.exam_id,
        payload.stream_id
      )
    } catch (error) {
      console.error('Error in term comparison handler:', error)
      throw error
    }
  })
}
