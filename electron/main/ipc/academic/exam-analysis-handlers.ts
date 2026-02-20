import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import {
  ExamAnalysisSubjectSchema,
  ExamAnalysisResultSchema,
  ExamAnalysisTeacherSchema,
  ExamAnalysisStudentSchema,
  ExamAnalysisStrugglingSchema
} from '../schemas/academic-schemas';
import { validatedHandlerMulti } from '../validated-handler';

const getService = () => container.resolve('ExamAnalysisService');

export function registerExamAnalysisHandlers() {
  validatedHandlerMulti('exam-analysis:getSubjectAnalysis', ROLES.STAFF, ExamAnalysisSubjectSchema, (_event, [subjectId, examId]: [number, number]) => {
    return getService().getSubjectAnalysis(examId, subjectId);
  });

  validatedHandlerMulti('exam-analysis:analyzeAllSubjects', ROLES.STAFF, ExamAnalysisResultSchema, (_event, [examId]: [number]) => {
    return getService().analyzeAllSubjects(examId);
  });

  validatedHandlerMulti('exam-analysis:getTeacherPerf', ROLES.STAFF, ExamAnalysisTeacherSchema, (_event, [teacherId, academicYearId, termId]: [number, number, number]) => {
    return getService().getTeacherPerformance(teacherId, academicYearId, termId);
  });

  validatedHandlerMulti('exam-analysis:getStudentPerf', ROLES.STAFF, ExamAnalysisStudentSchema, (_event, [studentId, examId]: [number, number]) => {
    return getService().getStudentPerformance(studentId, examId);
  });

  validatedHandlerMulti('exam-analysis:getStruggling', ROLES.STAFF, ExamAnalysisStrugglingSchema, (_event, [examId, threshold]: [number, number?]) => {
    return getService().getStrugglingStudents(examId, threshold ?? 50);
  });
}
