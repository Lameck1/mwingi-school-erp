import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

const getService = () => container.resolve('ExamAnalysisService');

export function registerExamAnalysisHandlers() {
  safeHandleRaw('exam-analysis:getSubjectAnalysis', (_event, subjectId: number, examId: number) => {
    return getService().getSubjectAnalysis(examId, subjectId);
  });

  safeHandleRaw('exam-analysis:analyzeAllSubjects', (_event, examId: number) => {
    return getService().analyzeAllSubjects(examId);
  });

  safeHandleRaw(
    'exam-analysis:getTeacherPerf',
    (_event, teacherId: number, academicYearId: number, termId: number) => {
    return getService().getTeacherPerformance(teacherId, academicYearId, termId);
  });

  safeHandleRaw('exam-analysis:getStudentPerf', (_event, studentId: number, examId: number) => {
    return getService().getStudentPerformance(studentId, examId);
  });

  safeHandleRaw('exam-analysis:getStruggling', (_event, examId: number, threshold?: number) => {
    return getService().getStrugglingStudents(examId, threshold ?? 50);
  });
}
