import { z } from 'zod'

// ==================== Academic Year & Terms ====================
export const AcademicYearCreateSchema = z.object({
    year_name: z.string().min(1, 'Year name is required'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    is_current: z.boolean().optional(),
})

export const AcademicYearActivateSchema = z.tuple([z.number()])
export const TermGetByYearSchema = z.tuple([z.number()])

// ==================== Subjects & Exams ====================
export const SubjectCreateSchema = z.object({
    code: z.string().min(1, 'Subject code is required'),
    name: z.string().min(1, 'Subject name is required'),
    curriculum: z.string().min(1, 'Curriculum is required'),
    is_compulsory: z.boolean().optional(),
    is_active: z.boolean().optional(),
})

export const SubjectUpdateDataSchema = z.object({
    code: z.string().optional(),
    name: z.string().optional(),
    curriculum: z.string().optional(),
    is_compulsory: z.boolean().optional(),
    is_active: z.boolean().optional(),
})

export const SubjectUpdateSchema = z.tuple([z.number(), SubjectUpdateDataSchema])

export const GetSubjectsSchema = z.void()
export const GetSubjectsAdminSchema = z.void()

export const SubjectSetActiveSchema = z.tuple([z.number(), z.boolean()])

export const GetExamsSchema = z.tuple([z.number(), z.number()]) // academicYearId, termId
export const CreateExamSchema = z.object({
    academic_year_id: z.number(),
    term_id: z.number(),
    name: z.string().min(1, 'Exam name is required'),
    weight: z.number().optional(),
})
export const DeleteExamSchema = z.tuple([z.number()])
export const ExamFiltersSchema = z.object({
    academicYearId: z.number().optional(),
    termId: z.number().optional(),
})

// ==================== Allocations ====================
export const AllocateTeacherSchema = z.object({
    academic_year_id: z.number(),
    term_id: z.number(),
    stream_id: z.number(),
    subject_id: z.number(),
    teacher_id: z.number(),
})

export const GetAllocationsSchema = z.tuple([z.number(), z.number(), z.number().optional()]) // year, term, stream(opt)
export const DeleteAllocationSchema = z.tuple([z.number()])

// ==================== Results ====================
export const ExamResultItemSchema = z.object({
    student_id: z.number(),
    subject_id: z.number(),
    score: z.number().nullable(),
    competency_level: z.number().nullable(),
    teacher_remarks: z.string().nullable(),
})

export const SaveResultsSchema = z.tuple([z.number(), z.array(ExamResultItemSchema)])
export const GetResultsSchema = z.tuple([z.number(), z.number(), z.number()]) // examId, subjectId, streamId
export const ProcessResultsSchema = z.tuple([z.number()])

// ==================== Attendance ====================
export const AttendanceGetByDateSchema = z.tuple([
    z.number(), // streamId
    z.string(), // date
    z.number(), // academicYearId
    z.number()  // termId
])

export const DailyAttendanceEntrySchema = z.object({
    student_id: z.number(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
    remarks: z.string().optional()
})

export const MarkAttendanceSchema = z.tuple([
    z.array(DailyAttendanceEntrySchema),
    z.number(), // streamId
    z.string(), // date
    z.number(), // academicYearId
    z.number(), // termId
    z.number().optional() // legacyUserId
])

export const GetStudentSummarySchema = z.tuple([z.number(), z.number(), z.number().optional()])
export const GetClassSummarySchema = z.tuple([z.number(), z.string(), z.number(), z.number()])
export const GetStudentsForMarkingSchema = z.tuple([z.number(), z.number(), z.number()])

// ==================== Awards ====================
export const AwardAssignSchema = z.object({
    studentId: z.number(),
    categoryId: z.number(),
    academicYearId: z.number(),
    termId: z.number().optional(),
    userId: z.number().optional(),
    userRole: z.string().optional(),
    remarks: z.string().optional()
})

export const AwardApproveSchema = z.object({
    awardId: z.number(),
    userId: z.number().optional()
})

export const AwardRejectSchema = z.object({
    awardId: z.number(),
    userId: z.number().optional(),
    reason: z.string()
})

export const AwardDeleteSchema = z.tuple([
    z.number(),
    z.number().optional() // legacyUserId
])

export const AwardGetAllSchema = z.object({
    status: z.string().optional(),
    categoryId: z.number().optional(),
    academicYearId: z.number().optional(),
    termId: z.number().optional()
}).optional() // Param is optional

export const AwardGetStudentAwardsSchema = z.tuple([z.number()])
export const AwardGetByIdSchema = z.tuple([z.number()])

// ==================== JSS ====================
export const JssTransitionSchema = z.object({
    student_id: z.number(),
    from_grade: z.number(),
    to_grade: z.number(),
    transition_date: z.string(),
    boarding_status_change: z.enum(['TO_BOARDER', 'TO_DAY_SCHOLAR', 'NO_CHANGE']).optional(),
    transition_notes: z.string().optional(),
    processed_by: z.number()
})

export const JssBulkTransitionSchema = z.object({
    student_ids: z.array(z.number()),
    from_grade: z.number(),
    to_grade: z.number(),
    transition_date: z.string(),
    processed_by: z.number()
})

export const JssFeeStructurePayloadSchema = z.object({
    grade: z.number(),
    fiscal_year: z.number(),
    tuition_fee_cents: z.number(),
    boarding_fee_cents: z.number().optional(),
    activity_fee_cents: z.number().optional(),
    exam_fee_cents: z.number().optional(),
    library_fee_cents: z.number().optional(),
    lab_fee_cents: z.number().optional(),
    ict_fee_cents: z.number().optional()
})

export const JssGetEligibleSchema = z.tuple([z.number(), z.number()])
export const JssGetFeeStructureSchema = z.tuple([z.number(), z.number()])
export const JssGetReportSchema = z.tuple([z.number()])
export const JssGetSummarySchema = z.tuple([z.number()])

// ==================== CBC ====================
export const CbcLinkFeeSchema = z.tuple([
    z.number(), // feeCategoryId
    z.number(), // strandId
    z.number(), // allocationPercentage
    z.number().optional() // legacyUserId
])

export const CbcRecordExpenseSchema = z.object({
    strand_id: z.number(),
    expense_date: z.string(),
    description: z.string(),
    gl_account_code: z.string(),
    amount_cents: z.number(),
    term: z.number(),
    fiscal_year: z.number(),
    receipt_number: z.string().optional(),
    created_by: z.number()
})

export const CbcRecordParticipationSchema = z.object({
    student_id: z.number(),
    strand_id: z.number(),
    activity_name: z.string(),
    start_date: z.string(),
    academic_year: z.number(),
    term: z.number(),
    participation_level: z.enum(['PRIMARY', 'SECONDARY', 'INTEREST'])
})

export const CbcGetProfitabilitySchema = z.tuple([z.number(), z.number().optional()])
export const CbcGetParticipationSchema = z.tuple([z.number()])

// ==================== Report Cards ====================
export const ReportCardGetSubjectsSchema = z.tuple([z.number().optional(), z.number().optional()])
export const ReportCardGetSchema = z.tuple([z.number(), z.number()]) // examId, studentId
export const ReportCardGenerateSchema = z.tuple([z.number(), z.number()]) // studentId, examId
export const ReportCardGenerateBatchSchema = z.object({
    exam_id: z.number(),
    stream_id: z.number()
})

export const ReportCardEmailSchema = z.object({
    exam_id: z.number(),
    stream_id: z.number(),
    template_id: z.string(),
    include_sms: z.boolean()
})

export const ReportCardMergeSchema = z.object({
    exam_id: z.number(),
    stream_id: z.number(),
    output_path: z.string()
})

export const ReportCardDownloadSchema = z.object({
    exam_id: z.number(),
    stream_id: z.number(),
    merge: z.boolean()
})

export const ReportCardOpenFileSchema = z.tuple([z.string()])

export const ScheduleExportPdfSchema = z.object({
    examId: z.number().optional(),
    title: z.string().optional(),
    slots: z.array(z.object({
        id: z.number(),
        subject_id: z.number(),
        subject_name: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        start_time: z.string(),
        end_time: z.string(),
        venue_id: z.number(),
        venue_name: z.string(),
        max_capacity: z.number(),
        enrolled_students: z.number()
    })).min(1)
})

export const LegacyReportCardGetGradesSchema = z.tuple([z.number(), z.number(), z.number()])
export const LegacyReportCardGenerateSchema = z.tuple([z.number(), z.number(), z.number()])
export const LegacyReportCardGetStudentsSchema = z.tuple([z.number(), z.number(), z.number()])

// ==================== Promotion ====================
export const PromotionGetStudentsSchema = z.tuple([z.number(), z.number()])
export const PromotionStudentSchema = z.object({
    student_id: z.number(),
    from_stream_id: z.number(),
    to_stream_id: z.number(),
    from_academic_year_id: z.number(),
    to_academic_year_id: z.number(),
    to_term_id: z.number()
})
export const PromotionBatchSchema = z.tuple([
    z.array(z.number()), // studentIds
    z.number(), // fromStreamId
    z.number(), // toStreamId
    z.number(), // fromAcademicYearId
    z.number(), // toAcademicYearId
    z.number(), // toTermId
    z.number().optional() // legacyUserId
])
export const PromotionHistorySchema = z.tuple([z.number()])
export const PromotionNextStreamSchema = z.tuple([z.number()])

// ==================== Merit List ====================
export const MeritListGenerateSchema = z.object({
    academicYearId: z.number(),
    termId: z.number(),
    streamId: z.number()
})

export const MeritListClassSchema = z.tuple([
    z.number(), // examId
    z.number(), // streamId
    z.number().optional() // legacyUserId
])

export const MeritListImprovementSchema = z.tuple([z.number()])

export const MeritListSubjectSchema = z.object({
    examId: z.number(),
    subjectId: z.number(),
    streamId: z.number()
})

export const MeritListSubjectDifficultySchema = z.object({
    examId: z.number(),
    subjectId: z.number(),
    streamId: z.number()
})

export const MeritListMostImprovedSchema = z.object({
    academicYearId: z.number(),
    currentTermId: z.number(),
    comparisonTermId: z.number(),
    streamId: z.number().optional(),
    minimumImprovement: z.number().optional()
})

// ==================== Analytics ====================
export const ExamAnalysisSubjectSchema = z.tuple([z.number(), z.number()]) // subjectId, examId
export const ExamAnalysisResultSchema = z.tuple([z.number()]) // examId
export const ExamAnalysisTeacherSchema = z.tuple([z.number(), z.number(), z.number()]) // teacherId, yearId, termId
export const ExamAnalysisStudentSchema = z.tuple([z.number(), z.number()]) // studentId, examId
export const ExamAnalysisStrugglingSchema = z.tuple([z.number(), z.number().optional()]) // examId, threshold

export const ReportCardAnalyticsPayloadSchema = z.object({
    exam_id: z.number(),
    stream_id: z.number(),
    threshold: z.number().optional()
})

export const PerformanceMostImprovedSchema = z.object({
    academicYearId: z.number(),
    currentTermId: z.number(),
    comparisonTermId: z.number(),
    streamId: z.number().optional(),
    minimumImprovement: z.number().optional()
})

export const PerformanceComparisonSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export const PerformanceStrugglingSchema = z.tuple([z.number(), z.number(), z.number().optional(), z.number().optional()])
export const PerformanceTrendsSchema = z.tuple([z.number(), z.number(), z.number().optional()])

// ==================== Schedules & PDF ====================
export const ExportPdfSchema = z.object({
    html: z.string().optional(),
    filename: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
})

export const ScheduleGenerateSchema = z.object({
    examId: z.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
})

export const ScheduleDetectClashesSchema = z.object({
    examId: z.number().optional()
})


export const CertificatePayloadSchema = z.object({
    studentId: z.number(),
    studentName: z.string(),
    awardCategory: z.string(),
    academicYearId: z.number(),
    improvementPercentage: z.number()
})

export const EmailParentsPayloadSchema = z.object({
    students: z.array(z.object({
        student_id: z.number(),
        student_name: z.string(),
        improvement_percentage: z.number()
    })),
    awardCategory: z.string(),
    templateType: z.string()
})

