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
    const request: {
      academicYearId: number
      currentTermId: number
      comparisonTermId: number
      streamId?: number
      minimumImprovement?: number
    } = {
      academicYearId: params.academicYearId,
      currentTermId: params.currentTermId,
      comparisonTermId: params.comparisonTermId
    }

    if (params.streamId !== undefined) {
      request.streamId = params.streamId
    }
    if (params.minimumImprovement !== undefined) {
      request.minimumImprovement = params.minimumImprovement
    }

    return getService().getMostImprovedStudents(request);
  });

  validatedHandlerMulti('performance:getComparison', ROLES.STAFF, PerformanceComparisonSchema, (_event, [studentId, academicYearId, currentTermId, comparisonTermId]) => {
    return getService().getStudentPerformanceComparison(studentId, academicYearId, currentTermId, comparisonTermId);
  });

  validatedHandlerMulti('performance:getStruggling', ROLES.STAFF, PerformanceStrugglingSchema, (_event, [academicYearId, termId, threshold, streamId]) => {
    return getService().getStrugglingStudents(academicYearId, termId, threshold ?? 50, streamId);
  });

  validatedHandlerMulti('performance:getTrends', ROLES.STAFF, PerformanceTrendsSchema, (_event, [studentId, academicYearId, numTerms]) => {
    return getService().getPerformanceTrends(studentId, academicYearId, numTerms ?? 3);
  });
}
