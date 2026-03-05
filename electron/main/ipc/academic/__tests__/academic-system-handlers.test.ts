import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 41
const validIsoDate = new Date().toISOString();
let sessionRole = 'TEACHER'

const academicSystemServiceMock = {
  getAllSubjects: vi.fn(() => []),
  getAllSubjectsAdmin: vi.fn(() => []),
  createSubject: vi.fn(() => ({ success: true, id: 1 })),
  updateSubject: vi.fn(() => ({ success: true })),
  setSubjectActive: vi.fn(() => ({ success: true })),
  getAllExams: vi.fn(() => []),
  createExam: vi.fn(() => ({ success: true })),
  deleteExam: vi.fn(() => ({ success: true })),
  allocateTeacher: vi.fn(() => ({ success: true })),
  getAllocations: vi.fn(() => []),
  deleteAllocation: vi.fn(() => ({ success: true })),
  saveResults: vi.fn(() => ({ success: true })),
  getResults: vi.fn(() => []),
  processResults: vi.fn(() => ({ success: true })),
  generateCertificate: vi.fn(() => ({ success: false, message: 'not implemented' })),
  emailParents: vi.fn(() => ({ success: false, message: 'not implemented' })),
}

const notificationServiceMock = {
  send: vi.fn(async () => ({ success: true })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'session-user',
        role: sessionRole,
        full_name: 'Session User',
        email: null,
        is_active: 1,
        last_login: null,
        created_at: validIsoDate
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => 'C:/app-data'),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'AcademicSystemService') {
        return academicSystemServiceMock
      }
      if (name === 'NotificationService') {
        return notificationServiceMock
      }
      return {}
    })
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => ({
    prepare: vi.fn(() => ({ get: vi.fn() }))
  })
}))

import { clearSessionCache } from '../../../security/session'
import { registerAcademicSystemHandlers } from '../academic-system-handlers'

describe('academic-system IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 41
    sessionRole = 'TEACHER'
    clearSessionCache()
    Object.values(academicSystemServiceMock).forEach(fn => fn.mockClear())
    notificationServiceMock.send.mockClear()
    registerAcademicSystemHandlers()
  })

  // ==================== Subject Management ====================

  it('academic:getSubjects returns all subjects for STAFF', async () => {
    const handler = handlerMap.get('academic:getSubjects')!
    academicSystemServiceMock.getAllSubjects.mockReturnValueOnce([{ id: 1, name: 'Math' }])
    const result = await handler({})
    expect(result).toEqual([{ id: 1, name: 'Math' }])
    expect(academicSystemServiceMock.getAllSubjects).toHaveBeenCalled()
  })

  it('academic:getSubjectsAdmin returns admin subjects for STAFF', async () => {
    const handler = handlerMap.get('academic:getSubjectsAdmin')!
    academicSystemServiceMock.getAllSubjectsAdmin.mockReturnValueOnce([{ id: 1, name: 'Math', is_active: true }])
    const result = await handler({})
    expect(result).toEqual([{ id: 1, name: 'Math', is_active: true }])
  })

  it('academic:createSubject uses authenticated actor id', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:createSubject')!
    const payload = { name: 'English', code: 'ENG', curriculum: '8-4-4' }
    const result = await handler({}, payload, 41) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.createSubject).toHaveBeenCalledWith(payload, 41)
  })

  it('academic:createSubject normalizes optional fields', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:createSubject')!
    const payload = { name: 'Science', code: 'SCI', curriculum: 'CBC', is_compulsory: true, is_active: false }
    const result = await handler({}, payload, 41) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.createSubject).toHaveBeenCalledWith(
      { name: 'Science', code: 'SCI', curriculum: 'CBC', is_compulsory: true, is_active: false },
      41
    )
  })

  it('academic:createSubject rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:createSubject')!
    const result = await handler({}, { name: 'English', code: 'ENG', curriculum: '8-4-4' }) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.createSubject).not.toHaveBeenCalled()
  })

  it('academic:updateSubject updates by id', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:updateSubject')!
    const result = await handler({}, 1, { name: 'English Updated' }) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.updateSubject).toHaveBeenCalledWith(1, { name: 'English Updated' }, 41)
  })

  it('academic:updateSubject normalizes all optional fields', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:updateSubject')!
    const result = await handler({}, 2, { code: 'SCI2', name: 'Science II', curriculum: 'CBC', is_compulsory: false, is_active: true }) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.updateSubject).toHaveBeenCalledWith(
      2,
      { code: 'SCI2', name: 'Science II', curriculum: 'CBC', is_compulsory: false, is_active: true },
      41
    )
  })

  it('academic:updateSubject rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:updateSubject')!
    const result = await handler({}, 1, { name: 'X' }) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.updateSubject).not.toHaveBeenCalled()
  })

  it('academic:setSubjectActive toggles subject active state', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:setSubjectActive')!
    const result = await handler({}, 5, false) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.setSubjectActive).toHaveBeenCalledWith(5, false, 41)
  })

  it('academic:setSubjectActive rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:setSubjectActive')!
    const result = await handler({}, 5, false) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.setSubjectActive).not.toHaveBeenCalled()
  })

  // ==================== Exam Management ====================

  it('academic:getExams returns exams for year+term', async () => {
    academicSystemServiceMock.getAllExams.mockReturnValueOnce([{ id: 1, name: 'Mid-Term' }])
    const handler = handlerMap.get('academic:getExams')!
    const result = await handler({}, 2025, 1)
    expect(result).toEqual([{ id: 1, name: 'Mid-Term' }])
    expect(academicSystemServiceMock.getAllExams).toHaveBeenCalledWith(2025, 1)
  })

  it('academic:createExam creates with normalized payload', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:createExam')!
    const result = await handler({}, { academic_year_id: 1, term_id: 2, name: 'Final', weight: 40 }) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.createExam).toHaveBeenCalledWith(
      { academic_year_id: 1, term_id: 2, name: 'Final', weight: 40 },
      41
    )
  })

  it('academic:createExam normalizes without optional weight', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:createExam')!
    await handler({}, { academic_year_id: 1, term_id: 2, name: 'Quiz' })
    expect(academicSystemServiceMock.createExam).toHaveBeenCalledWith(
      { academic_year_id: 1, term_id: 2, name: 'Quiz' },
      41
    )
  })

  it('academic:createExam rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:createExam')!
    const result = await handler({}, { academic_year_id: 1, term_id: 2, name: 'Final' }) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.createExam).not.toHaveBeenCalled()
  })

  it('academic:deleteExam deletes by id', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:deleteExam')!
    const result = await handler({}, 10) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.deleteExam).toHaveBeenCalledWith(10, 41)
  })

  it('academic:deleteExam rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:deleteExam')!
    const result = await handler({}, 10) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.deleteExam).not.toHaveBeenCalled()
  })

  // ==================== Teacher Allocations ====================

  it('academic:allocateTeacher allocates teacher to stream/subject', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:allocateTeacher')!
    const payload = { academic_year_id: 1, term_id: 2, stream_id: 3, subject_id: 4, teacher_id: 5 }
    const result = await handler({}, payload) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.allocateTeacher).toHaveBeenCalledWith(payload, 41)
  })

  it('academic:allocateTeacher rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:allocateTeacher')!
    const result = await handler({}, { academic_year_id: 1, term_id: 2, stream_id: 3, subject_id: 4, teacher_id: 5 }) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.allocateTeacher).not.toHaveBeenCalled()
  })

  it('academic:getAllocations returns allocations for year+term+stream', async () => {
    academicSystemServiceMock.getAllocations.mockReturnValueOnce([{ id: 1, teacher_id: 5 }])
    const handler = handlerMap.get('academic:getAllocations')!
    const result = await handler({}, 1, 2, 3)
    expect(result).toEqual([{ id: 1, teacher_id: 5 }])
    expect(academicSystemServiceMock.getAllocations).toHaveBeenCalledWith(1, 2, 3)
  })

  it('academic:getAllocations works without optional streamId', async () => {
    academicSystemServiceMock.getAllocations.mockReturnValueOnce([])
    const handler = handlerMap.get('academic:getAllocations')!
    const result = await handler({}, 1, 2)
    expect(result).toEqual([])
    expect(academicSystemServiceMock.getAllocations).toHaveBeenCalledWith(1, 2, undefined)
  })

  it('academic:deleteAllocation deletes by id', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:deleteAllocation')!
    const result = await handler({}, 99) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.deleteAllocation).toHaveBeenCalledWith(99, 41)
  })

  it('academic:deleteAllocation rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:deleteAllocation')!
    const result = await handler({}, 99) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.deleteAllocation).not.toHaveBeenCalled()
  })

  // ==================== Results ====================

  it('academic:saveResults saves exam results', async () => {
    const handler = handlerMap.get('academic:saveResults')!
    const results = [{ student_id: 1, subject_id: 2, score: 85, competency_level: 3, teacher_remarks: 'Good' }]
    const result = await handler({}, 10, results) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.saveResults).toHaveBeenCalledWith(10, results, 41)
  })

  it('academic:getResults retrieves results for exam/subject/stream', async () => {
    academicSystemServiceMock.getResults.mockReturnValueOnce([{ student_id: 1, score: 90 }])
    const handler = handlerMap.get('academic:getResults')!
    const result = await handler({}, 10, 2, 3)
    expect(result).toEqual([{ student_id: 1, score: 90 }])
    expect(academicSystemServiceMock.getResults).toHaveBeenCalledWith(10, 2, 3, 41)
  })

  it('academic:processResults processes exam results (ADMIN)', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:processResults')!
    const result = await handler({}, 10) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.processResults).toHaveBeenCalledWith(10, 41)
  })

  it('academic:processResults rejects non-ADMIN', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academic:processResults')!
    const result = await handler({}, 10) as { success: boolean }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.processResults).not.toHaveBeenCalled()
  })

  // ==================== Certificates & Emails ====================

  it('academic:generateCertificate returns explicit non-success when unimplemented', async () => {
    const handler = handlerMap.get('academic:generateCertificate')!
    const payload = {
      studentId: 1,
      studentName: 'Jane Doe',
      awardCategory: 'Academic Excellence',
      academicYearId: 2026,
      improvementPercentage: 12
    }
    const result = await handler({}, payload) as { success: boolean; message: string }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.generateCertificate).toHaveBeenCalledWith(payload)
  })

  it('academic:emailParents returns explicit non-success when unimplemented', async () => {
    const handler = handlerMap.get('academic:emailParents')!
    const payload = {
      students: [{ student_id: 1, student_name: 'Jane Doe', improvement_percentage: 14 }],
      awardCategory: 'Improvement',
      templateType: 'DEFAULT'
    }
    const result = await handler({}, payload) as { success: boolean; message: string }
    expect(result.success).toBe(false)
    expect(academicSystemServiceMock.emailParents).toHaveBeenCalledWith(payload)
  })

  it('academic:updateSubject normalizes minimal update with only code field', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:updateSubject')!
    const result = await handler({}, 1, { code: 'ENG-V2' }) as { success: boolean }
    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.updateSubject).toHaveBeenCalledWith(
      1,
      { code: 'ENG-V2' },
      41
    )
  })

  it('academic:createSubject omits undefined optional fields from normalized payload', async () => {
    sessionRole = 'ADMIN'
    const handler = handlerMap.get('academic:createSubject')!
    const payload = { name: 'Art', code: 'ART', curriculum: 'CBC' }
    await handler({}, payload, 41)
    const callArg = academicSystemServiceMock.createSubject.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('is_compulsory')
    expect(callArg).not.toHaveProperty('is_active')
  })
})
