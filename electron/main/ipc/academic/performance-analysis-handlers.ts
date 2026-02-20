import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import {
  PerformanceMostImprovedSchema,
  PerformanceComparisonSchema,
  PerformanceStrugglingSchema,
  PerformanceTrendsSchema
} from '../schemas/academic-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

const getService = () => container.resolve('PerformanceAnalysisService');

export function registerPerformanceAnalysisHandlers() {
  validatedHandler('performance:getMostImproved', ROLES.STAFF, PerformanceMostImprovedSchema, (_event, params) => {
    return getService().getMostImprovedStudents(params);
  });

  validatedHandlerMulti('performance:getComparison', ROLES.STAFF, PerformanceComparisonSchema, (_event, [studentId, academicYearId, currentTermId, comparisonTermId]: [number, number, number, number]) => {
    return getService().getStudentPerformanceComparison(studentId, academicYearId, currentTermId, comparisonTermId);
  });

  validatedHandlerMulti('performance:getStruggling', ROLES.STAFF, PerformanceStrugglingSchema, (_event, [academicYearId, termId, threshold, streamId]: [number, number, number?, number?]) => {
    return getService().getStrugglingStudents(academicYearId, termId, threshold ?? 50, streamId);
  });

  validatedHandlerMulti('performance:getTrends', ROLES.STAFF, PerformanceTrendsSchema, (_event, [studentId, academicYearId, numTerms]: [number, number, number?]) => {
    return getService().getPerformanceTrends(studentId, academicYearId, numTerms ?? 3);
  });
}
