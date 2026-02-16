import { container } from '../../services/base/ServiceContainer';
import { ROLES, safeHandleRawWithRole } from '../ipc-result';

const getService = () => container.resolve('ExamAnalysisService');

export function registerExamAnalysisHandlers() {
  safeHandleRawWithRole('exam-analysis:getSubjectAnalysis', ROLES.STAFF, (_event, subjectId: number, examId: number) => {
    return getService().getSubjectAnalysis(examId, subjectId);
  });

  safeHandleRawWithRole('exam-analysis:analyzeAllSubjects', ROLES.STAFF, (_event, examId: number) => {
    return getService().analyzeAllSubjects(examId);
  });

  safeHandleRawWithRole(
    'exam-analysis:getTeacherPerf',
    ROLES.STAFF,
    (_event, teacherId: number, academicYearId: number, termId: number) => {
    return getService().getTeacherPerformance(teacherId, academicYearId, termId);
  });

  safeHandleRawWithRole('exam-analysis:getStudentPerf', ROLES.STAFF, (_event, studentId: number, examId: number) => {
    return getService().getStudentPerformance(studentId, examId);
  });

  safeHandleRawWithRole('exam-analysis:getStruggling', ROLES.STAFF, (_event, examId: number, threshold?: number) => {
    return getService().getStrugglingStudents(examId, threshold ?? 50);
  });
}
