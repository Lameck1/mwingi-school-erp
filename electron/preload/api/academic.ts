import { ipcRenderer } from 'electron'

export function createAcademicAPI() {
  return {
    // Academic Years & Terms
    getAcademicYears: () => ipcRenderer.invoke('academicYear:getAll'),
    getCurrentAcademicYear: () => ipcRenderer.invoke('academicYear:getCurrent'),
    createAcademicYear: (data: unknown) => ipcRenderer.invoke('academicYear:create', data),
    activateAcademicYear: (id: number) => ipcRenderer.invoke('academicYear:activate', id),
    getTermsByYear: (yearId: number) => ipcRenderer.invoke('term:getByYear', yearId),
    getCurrentTerm: () => ipcRenderer.invoke('term:getCurrent'),
    getStreams: () => ipcRenderer.invoke('stream:getAll'),

    // Academic System
    getAcademicSubjects: () => ipcRenderer.invoke('academic:getSubjects'),
    getAcademicSubjectsAdmin: () => ipcRenderer.invoke('academic:getSubjectsAdmin'),
    createAcademicSubject: (data: unknown, userId: number) => ipcRenderer.invoke('academic:createSubject', data, userId),
    updateAcademicSubject: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('academic:updateSubject', id, data, userId),
    setAcademicSubjectActive: (id: number, isActive: boolean, userId: number) => ipcRenderer.invoke('academic:setSubjectActive', id, isActive, userId),
    getAcademicExams: (academicYearId: number, termId: number) => ipcRenderer.invoke('academic:getExams', academicYearId, termId),
    createAcademicExam: (data: unknown, userId: number) => ipcRenderer.invoke('academic:createExam', data, userId),
    deleteAcademicExam: (id: number, userId: number) => ipcRenderer.invoke('academic:deleteExam', id, userId),
    allocateTeacher: (data: unknown, userId: number) => ipcRenderer.invoke('academic:allocateTeacher', data, userId),
    getTeacherAllocations: (academicYearId: number, termId: number, streamId?: number) =>
      ipcRenderer.invoke('academic:getAllocations', academicYearId, termId, streamId),
    deleteTeacherAllocation: (allocationId: number, userId: number) =>
      ipcRenderer.invoke('academic:deleteAllocation', allocationId, userId),
    saveAcademicResults: (examId: number, results: unknown[], userId: number) =>
      ipcRenderer.invoke('academic:saveResults', examId, results, userId),
    getAcademicResults: (examId: number, subjectId: number, streamId: number, userId: number) =>
      ipcRenderer.invoke('academic:getResults', examId, subjectId, streamId, userId),
    processAcademicResults: (examId: number, userId: number) => ipcRenderer.invoke('academic:processResults', examId, userId),

    // Report Cards (Legacy / Non-CBC)
    getSubjects: () => ipcRenderer.invoke('reportcard:getSubjects'),
    getStudentGrades: (studentId: number, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('reportcard:getStudentGrades', studentId, academicYearId, termId),
    generateReportCard: (studentId: number, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('reportcard:generate', studentId, academicYearId, termId),
    getStudentsForReportCards: (streamId: number, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('reportcard:getStudentsForGeneration', streamId, academicYearId, termId),

    // CBC Report Card Methods
    generateBatchReportCards: (data: unknown) => ipcRenderer.invoke('report-card:generateBatch', data),
    emailReportCards: (data: unknown) => ipcRenderer.invoke('report-card:emailReports', data),
    mergeReportCards: (data: unknown) => ipcRenderer.invoke('report-card:mergePDFs', data),
    downloadReportCards: (data: unknown) => ipcRenderer.invoke('report-card:downloadReports', data),

    // Merit Lists & Analysis
    generateMeritList: (options: unknown) => ipcRenderer.invoke('merit-list:generate', options),
    generateClassMeritList: (examId: number, streamId: number) => ipcRenderer.invoke('merit-list:getClass', examId, streamId),
    getSubjectMeritList: (filters: { examId: number; subjectId: number; streamId: number }) =>
      ipcRenderer.invoke('merit-list:getSubject', filters),
    getPerformanceImprovement: (studentId: number) => ipcRenderer.invoke('merit-list:getImprovement', studentId),
    getMostImprovedStudents: (filters: unknown) => ipcRenderer.invoke('merit-list:getMostImproved', filters),
    getSubjectDifficulty: (filters: { examId: number; subjectId: number; streamId: number }) =>
      ipcRenderer.invoke('merit-list:getSubjectDifficulty', filters),

    // Exam Analysis
    getSubjectAnalysis: (subjectId: number, examId: number) => ipcRenderer.invoke('exam-analysis:getSubjectAnalysis', subjectId, examId),
    analyzeAllSubjects: (examId: number) => ipcRenderer.invoke('exam-analysis:analyzeAllSubjects', examId),

    // Performance / Report Card Analytics
    getPerformanceSummary: (filters: unknown) => ipcRenderer.invoke('report-card-analytics:getPerformanceSummary', filters),
    getGradeDistribution: (filters: unknown) => ipcRenderer.invoke('report-card-analytics:getGradeDistribution', filters),
    getSubjectPerformance: (filters: unknown) => ipcRenderer.invoke('report-card-analytics:getSubjectPerformance', filters),
    getStrugglingStudents: (filters: unknown) => ipcRenderer.invoke('report-card-analytics:getStrugglingStudents', filters),
    getTermComparison: (filters: unknown) => ipcRenderer.invoke('report-card-analytics:getTermComparison', filters),

    // Certificates & Parent Notifications
    generateCertificate: (data: unknown) => ipcRenderer.invoke('academic:generateCertificate', data),
    emailParents: (data: unknown, userId: number) => ipcRenderer.invoke('academic:emailParents', data, userId),

    // Awards
    getAwards: (filters?: unknown) => ipcRenderer.invoke('awards:getAll', filters),
    getAwardById: (id: number) => ipcRenderer.invoke('awards:getById', id),
    getAwardCategories: () => ipcRenderer.invoke('awards:getCategories'),
    awardStudent: (data: unknown) => ipcRenderer.invoke('awards:assign', data),
    approveAward: (data: unknown) => ipcRenderer.invoke('awards:approve', data),
    rejectAward: (data: unknown) => ipcRenderer.invoke('awards:reject', data),
    deleteAward: (data: unknown) => ipcRenderer.invoke('awards:delete', data),
    getStudentAwards: (studentId: number) => ipcRenderer.invoke('awards:getStudentAwards', studentId),
    getPendingAwardsCount: () => ipcRenderer.invoke('awards:getPendingCount'),

    // Exam Scheduling
    generateExamTimetable: (config: unknown) => ipcRenderer.invoke('schedule:generate', config),
    detectExamClashes: (filters: unknown) => ipcRenderer.invoke('schedule:detectClashes', filters),
    exportExamTimetableToPDF: (data: unknown) => ipcRenderer.invoke('schedule:exportPDF', data),
    getExams: (filters?: unknown) => ipcRenderer.invoke('academic:getExamsList', filters),

    // Attendance
    getAttendanceByDate: (streamId: number, date: string, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('attendance:getByDate', streamId, date, academicYearId, termId),
    markAttendance: (...args: [entries: unknown[], streamId: number, date: string, academicYearId: number, termId: number, userId: number]) =>
      ipcRenderer.invoke('attendance:markAttendance', ...args),
    getStudentAttendanceSummary: (studentId: number, academicYearId: number, termId?: number) =>
      ipcRenderer.invoke('attendance:getStudentSummary', studentId, academicYearId, termId),
    getClassAttendanceSummary: (streamId: number, date: string, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('attendance:getClassSummary', streamId, date, academicYearId, termId),
    getStudentsForAttendance: (streamId: number, academicYearId: number, termId: number) =>
      ipcRenderer.invoke('attendance:getStudentsForMarking', streamId, academicYearId, termId),

    // Promotions
    getPromotionStreams: () => ipcRenderer.invoke('promotion:getStreams'),
    getStudentsForPromotion: (streamId: number, academicYearId: number) => ipcRenderer.invoke('promotion:getStudentsForPromotion', streamId, academicYearId),
    promoteStudent: (data: unknown, userId: number) => ipcRenderer.invoke('promotion:promoteStudent', data, userId),
    batchPromoteStudents: (...args: [studentIds: number[], fromStreamId: number, toStreamId: number, fromAcademicYearId: number, toAcademicYearId: number, toTermId: number, userId: number]) =>
      ipcRenderer.invoke('promotion:batchPromote', ...args),
    getStudentPromotionHistory: (studentId: number) => ipcRenderer.invoke('promotion:getStudentHistory', studentId),
    getNextStream: (currentStreamId: number) => ipcRenderer.invoke('promotion:getNextStream', currentStreamId),

    // CBC Strands
    getCBCStrands: () => ipcRenderer.invoke('cbc:getStrands'),
    getActiveCBCStrands: () => ipcRenderer.invoke('cbc:getActiveStrands'),
    linkFeeCategoryToStrand: (feeCategoryId: number, strandId: number, allocationPercentage: number, userId: number) =>
      ipcRenderer.invoke('cbc:linkFeeCategory', feeCategoryId, strandId, allocationPercentage, userId),
    recordCBCExpense: (data: unknown) => ipcRenderer.invoke('cbc:recordExpense', data),
    getCBCProfitabilityReport: (fiscalYear: number, term?: number) => ipcRenderer.invoke('cbc:getProfitabilityReport', fiscalYear, term),
    recordStudentParticipation: (data: unknown) => ipcRenderer.invoke('cbc:recordParticipation', data),
    getStudentParticipations: (studentId: number) => ipcRenderer.invoke('cbc:getStudentParticipations', studentId),

    // JSS Transitions
    initiateJSSTransition: (data: unknown) => ipcRenderer.invoke('jss:initiateTransition', data),
    bulkJSSTransition: (data: unknown) => ipcRenderer.invoke('jss:bulkTransition', data),
    getJSSEligibleStudents: (fromGrade: number, fiscalYear: number) => ipcRenderer.invoke('jss:getEligibleStudents', fromGrade, fiscalYear),
    /** @deprecated Use getJSSEligibleStudents instead */
    getEligibleStudents: (fromGrade: number, fiscalYear: number) => ipcRenderer.invoke('jss:getEligibleStudents', fromGrade, fiscalYear),
    getJSSFeeStructure: (grade: number, fiscalYear: number) => ipcRenderer.invoke('jss:getFeeStructure', grade, fiscalYear),
    /** @deprecated Use bulkJSSTransition instead */
    bulkTransition: (data: unknown) => ipcRenderer.invoke('jss:bulkTransition', data),
  }
}
