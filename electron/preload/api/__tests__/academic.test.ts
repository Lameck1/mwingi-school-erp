/**
 * Tests for electron/preload/api/academic.ts
 *
 * Verifies every method in createAcademicAPI() calls ipcRenderer.invoke
 * with the correct channel and arguments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ success: true }),
  },
}))

import { ipcRenderer } from 'electron'
import { createAcademicAPI } from '../academic'

describe('createAcademicAPI', () => {
  let api: ReturnType<typeof createAcademicAPI>

  beforeEach(() => {
    vi.clearAllMocks()
    api = createAcademicAPI()
  })

  it('returns an object with all expected methods', () => {
    // Curriculum
    expect(typeof api.getAcademicYears).toBe('function')
    expect(typeof api.getCurrentAcademicYear).toBe('function')
    expect(typeof api.createAcademicYear).toBe('function')
    expect(typeof api.activateAcademicYear).toBe('function')
    expect(typeof api.getTermsByYear).toBe('function')
    expect(typeof api.getCurrentTerm).toBe('function')
    expect(typeof api.getStreams).toBe('function')
    expect(typeof api.getAcademicSubjects).toBe('function')
    expect(typeof api.createAcademicSubject).toBe('function')
    expect(typeof api.updateAcademicSubject).toBe('function')
    expect(typeof api.setAcademicSubjectActive).toBe('function')
    expect(typeof api.getAcademicExams).toBe('function')
    expect(typeof api.createAcademicExam).toBe('function')
    expect(typeof api.deleteAcademicExam).toBe('function')
    expect(typeof api.allocateTeacher).toBe('function')
    expect(typeof api.getTeacherAllocations).toBe('function')
    expect(typeof api.deleteTeacherAllocation).toBe('function')
    expect(typeof api.saveAcademicResults).toBe('function')
    expect(typeof api.getAcademicResults).toBe('function')
    expect(typeof api.processAcademicResults).toBe('function')
    // Report Card & Analytics
    expect(typeof api.getSubjects).toBe('function')
    expect(typeof api.generateReportCard).toBe('function')
    expect(typeof api.generateBatchReportCards).toBe('function')
    expect(typeof api.generateMeritList).toBe('function')
    expect(typeof api.getSubjectAnalysis).toBe('function')
    // Awards & Operations
    expect(typeof api.getAwards).toBe('function')
    expect(typeof api.awardStudent).toBe('function')
    expect(typeof api.markAttendance).toBe('function')
    expect(typeof api.promoteStudent).toBe('function')
    expect(typeof api.getCBCStrands).toBe('function')
    expect(typeof api.initiateJSSTransition).toBe('function')
  })

  // ---- Curriculum API ----
  describe('Curriculum methods', () => {
    it('getAcademicYears → academicYear:getAll', async () => {
      await api.getAcademicYears()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academicYear:getAll')
    })

    it('getCurrentAcademicYear → academicYear:getCurrent', async () => {
      await api.getCurrentAcademicYear()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academicYear:getCurrent')
    })

    it('createAcademicYear → academicYear:create', async () => {
      const data = { year_name: '2025', start_date: '2025-01-01', end_date: '2025-12-31' }
      await api.createAcademicYear(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academicYear:create', data)
    })

    it('activateAcademicYear → academicYear:activate', async () => {
      await api.activateAcademicYear(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academicYear:activate', 5)
    })

    it('getTermsByYear → term:getByYear', async () => {
      await api.getTermsByYear(1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('term:getByYear', 1)
    })

    it('getCurrentTerm → term:getCurrent', async () => {
      await api.getCurrentTerm()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('term:getCurrent')
    })

    it('getStreams → stream:getAll', async () => {
      await api.getStreams()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('stream:getAll')
    })

    it('getAcademicSubjects → academic:getSubjects', async () => {
      await api.getAcademicSubjects()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:getSubjects')
    })

    it('getAcademicSubjectsAdmin → academic:getSubjectsAdmin', async () => {
      await api.getAcademicSubjectsAdmin()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:getSubjectsAdmin')
    })

    it('createAcademicSubject → academic:createSubject', async () => {
      const data = { code: 'MATH', name: 'Mathematics', curriculum: 'CBC' }
      await api.createAcademicSubject(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:createSubject', data, 1)
    })

    it('updateAcademicSubject → academic:updateSubject', async () => {
      await api.updateAcademicSubject(5, { name: 'Maths' }, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:updateSubject', 5, { name: 'Maths' }, 1)
    })

    it('setAcademicSubjectActive → academic:setSubjectActive', async () => {
      await api.setAcademicSubjectActive(5, false, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:setSubjectActive', 5, false, 1)
    })

    it('getAcademicExams → academic:getExams', async () => {
      await api.getAcademicExams(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:getExams', 1, 2)
    })

    it('createAcademicExam → academic:createExam', async () => {
      const data = { academic_year_id: 1, term_id: 2, name: 'Mid-Term' }
      await api.createAcademicExam(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:createExam', data, 1)
    })

    it('deleteAcademicExam → academic:deleteExam', async () => {
      await api.deleteAcademicExam(3, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:deleteExam', 3, 1)
    })

    it('allocateTeacher → academic:allocateTeacher', async () => {
      const data = { academic_year_id: 1, term_id: 2, stream_id: 3, subject_id: 4, teacher_id: 5 }
      await api.allocateTeacher(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:allocateTeacher', data, 1)
    })

    it('getTeacherAllocations → academic:getAllocations', async () => {
      await api.getTeacherAllocations(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:getAllocations', 1, 2, 3)
    })

    it('deleteTeacherAllocation → academic:deleteAllocation', async () => {
      await api.deleteTeacherAllocation(5, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:deleteAllocation', 5, 1)
    })

    it('saveAcademicResults → academic:saveResults', async () => {
      const results = [{ student_id: 1, subject_id: 2, score: 85, competency_level: 4, teacher_remarks: '' }]
      await api.saveAcademicResults(10, results, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:saveResults', 10, results, 1)
    })

    it('getAcademicResults → academic:getResults', async () => {
      await api.getAcademicResults(1, 2, 3, 4)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:getResults', 1, 2, 3, 4)
    })

    it('processAcademicResults → academic:processResults', async () => {
      await api.processAcademicResults(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:processResults', 1, 2)
    })
  })

  // ---- Report Card & Analytics API ----
  describe('Report Card & Analytics methods', () => {
    it('getSubjects → reportcard:getSubjects', async () => {
      await api.getSubjects()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reportcard:getSubjects')
    })

    it('getStudentGrades → reportcard:getStudentGrades', async () => {
      await api.getStudentGrades(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reportcard:getStudentGrades', 1, 2, 3)
    })

    it('generateReportCard → reportcard:generate', async () => {
      await api.generateReportCard(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reportcard:generate', 1, 2, 3)
    })

    it('getStudentsForReportCards → reportcard:getStudentsForGeneration', async () => {
      await api.getStudentsForReportCards(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reportcard:getStudentsForGeneration', 1, 2, 3)
    })

    it('generateBatchReportCards → report-card:generateBatch', async () => {
      const data = { exam_id: 1, stream_id: 2 }
      await api.generateBatchReportCards(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card:generateBatch', data)
    })

    it('emailReportCards → report-card:emailReports', async () => {
      const data = { exam_id: 1, stream_id: 2 }
      await api.emailReportCards(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card:emailReports', data)
    })

    it('mergeReportCards → report-card:mergePDFs', async () => {
      const data = { exam_id: 1, stream_id: 2 }
      await api.mergeReportCards(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card:mergePDFs', data)
    })

    it('openReportCardFile → report-card:openFile', async () => {
      await api.openReportCardFile('/path/to/report.pdf')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card:openFile', '/path/to/report.pdf')
    })

    it('generateMeritList → merit-list:generate', async () => {
      const options = { examId: 1, academicYearId: 1, termId: 2, streamId: 3 }
      await api.generateMeritList(options)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('merit-list:generate', options)
    })

    it('generateClassMeritList → merit-list:getClass', async () => {
      await api.generateClassMeritList(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('merit-list:getClass', 1, 2)
    })

    it('getSubjectMeritList → merit-list:getSubject', async () => {
      const filters = { examId: 1, subjectId: 2, streamId: 3 }
      await api.getSubjectMeritList(filters)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('merit-list:getSubject', filters)
    })

    it('getPerformanceImprovement → merit-list:getImprovement', async () => {
      await api.getPerformanceImprovement(1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('merit-list:getImprovement', 1)
    })

    it('getSubjectAnalysis → exam-analysis:getSubjectAnalysis', async () => {
      await api.getSubjectAnalysis(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('exam-analysis:getSubjectAnalysis', 1, 2)
    })

    it('analyzeAllSubjects → exam-analysis:analyzeAllSubjects', async () => {
      await api.analyzeAllSubjects(1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('exam-analysis:analyzeAllSubjects', 1)
    })

    it('getPerformanceSummary → report-card-analytics:getPerformanceSummary', async () => {
      const filters = { academicYearId: 1, currentTermId: 1, comparisonTermId: 2 }
      await api.getPerformanceSummary(filters as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card-analytics:getPerformanceSummary', filters)
    })

    it('getStrugglingStudents → report-card-analytics:getStrugglingStudents', async () => {
      const filters = { academicYearId: 1, currentTermId: 1, comparisonTermId: 2 }
      await api.getStrugglingStudents(filters as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-card-analytics:getStrugglingStudents', filters)
    })

    it('generateCertificate → academic:generateCertificate', async () => {
      const data = { exam_id: 1, stream_id: 2 }
      await api.generateCertificate(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:generateCertificate', data)
    })

    it('emailParents → academic:emailParents', async () => {
      const data = { exam_id: 1, stream_id: 2 }
      await api.emailParents(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('academic:emailParents', data, 1)
    })
  })

  // ---- Awards & Operations API ----
  describe('Awards & Operations methods', () => {
    it('getAwards → awards:getAll', async () => {
      await api.getAwards({ status: 'APPROVED' } as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:getAll', { status: 'APPROVED' })
    })

    it('getAwardById → awards:getById', async () => {
      await api.getAwardById(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:getById', 5)
    })

    it('getAwardCategories → awards:getCategories', async () => {
      await api.getAwardCategories()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:getCategories')
    })

    it('awardStudent → awards:assign', async () => {
      const data = { student_id: 1, category_id: 2, title: 'Excellence', academic_year_id: 3, term_id: 1, awarded_by: 1 }
      await api.awardStudent(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:assign', data)
    })

    it('approveAward → awards:approve', async () => {
      const data = { id: 1, userId: 1 }
      await api.approveAward(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:approve', data)
    })

    it('rejectAward → awards:reject', async () => {
      const data = { awardId: 1, reason: 'Not eligible' }
      await api.rejectAward(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:reject', data)
    })

    it('deleteAward → awards:delete', async () => {
      const data = { id: 1, userId: 1 }
      await api.deleteAward(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:delete', data)
    })

    it('getPendingAwardsCount → awards:getPendingCount', async () => {
      await api.getPendingAwardsCount()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('awards:getPendingCount')
    })

    it('generateExamTimetable → schedule:generate', async () => {
      const config = { examId: 1 }
      await api.generateExamTimetable(config as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('schedule:generate', config)
    })

    it('detectExamClashes → schedule:detectClashes', async () => {
      const filters = { examId: 1 }
      await api.detectExamClashes(filters as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('schedule:detectClashes', filters)
    })

    it('getAttendanceByDate → attendance:getByDate', async () => {
      await api.getAttendanceByDate(1, '2024-05-01', 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('attendance:getByDate', 1, '2024-05-01', 2, 3)
    })

    it('markAttendance → attendance:markAttendance', async () => {
      const entries = [{ student_id: 1, status: 'PRESENT' as const }]
      await api.markAttendance(entries as never, 1, '2024-05-01', 2, 3, 4)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('attendance:markAttendance', entries, 1, '2024-05-01', 2, 3, 4)
    })

    it('getStudentAttendanceSummary → attendance:getStudentSummary', async () => {
      await api.getStudentAttendanceSummary(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('attendance:getStudentSummary', 1, 2, 3)
    })

    it('getPromotionStreams → promotion:getStreams', async () => {
      await api.getPromotionStreams()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('promotion:getStreams')
    })

    it('promoteStudent → promotion:promoteStudent', async () => {
      const data = { studentId: 1, fromStreamId: 2, toStreamId: 3, fromAcademicYearId: 1, toAcademicYearId: 2, toTermId: 1 }
      await api.promoteStudent(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('promotion:promoteStudent', data, 1)
    })

    it('batchPromoteStudents → promotion:batchPromote', async () => {
      await api.batchPromoteStudents([1, 2, 3], 1, 2, 1, 2, 1, 5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('promotion:batchPromote', [1, 2, 3], 1, 2, 1, 2, 1, 5)
    })

    it('getStudentPromotionHistory → promotion:getStudentHistory', async () => {
      await api.getStudentPromotionHistory(1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('promotion:getStudentHistory', 1)
    })

    it('getNextStream → promotion:getNextStream', async () => {
      await api.getNextStream(3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('promotion:getNextStream', 3)
    })

    it('getCBCStrands → cbc:getStrands', async () => {
      await api.getCBCStrands()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('cbc:getStrands')
    })

    it('getActiveCBCStrands → cbc:getActiveStrands', async () => {
      await api.getActiveCBCStrands()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('cbc:getActiveStrands')
    })

    it('linkFeeCategoryToStrand → cbc:linkFeeCategory', async () => {
      await api.linkFeeCategoryToStrand(1, 2, 50, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('cbc:linkFeeCategory', 1, 2, 50, 3)
    })

    it('recordCBCExpense → cbc:recordExpense', async () => {
      const data = { strandId: 1, amount: 50000, description: 'Materials', expenseDate: '2024-01-15' }
      await api.recordCBCExpense(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('cbc:recordExpense', data)
    })

    it('getCBCProfitabilityReport → cbc:getProfitabilityReport', async () => {
      await api.getCBCProfitabilityReport(2024, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('cbc:getProfitabilityReport', 2024, 1)
    })

    it('initiateJSSTransition → jss:initiateTransition', async () => {
      const data = { studentId: 1, fromGrade: 6, toGrade: 7, fiscalYear: 2024 }
      await api.initiateJSSTransition(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('jss:initiateTransition', data)
    })

    it('bulkJSSTransition → jss:bulkTransition', async () => {
      const data = { studentIds: [1, 2], fromGrade: 6, toGrade: 7, fiscalYear: 2024 }
      await api.bulkJSSTransition(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('jss:bulkTransition', data)
    })

    it('getJSSEligibleStudents → jss:getEligibleStudents', async () => {
      await api.getJSSEligibleStudents(6, 2024)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('jss:getEligibleStudents', 6, 2024)
    })

    it('getJSSFeeStructure → jss:getFeeStructure', async () => {
      await api.getJSSFeeStructure(7, 2024)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('jss:getFeeStructure', 7, 2024)
    })
  })
})
