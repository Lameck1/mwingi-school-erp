import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

const getService = () => container.resolve('PerformanceAnalysisService');

export function registerPerformanceAnalysisHandlers() {
  safeHandleRaw('performance:getMostImproved', (_event, params: {
    academicYearId: number;
    currentTermId: number;
    comparisonTermId: number;
    streamId?: number;
    minimumImprovement?: number;
  }) => {
    return getService().getMostImprovedStudents(params);
  });

  safeHandleRaw(
    'performance:getComparison',
    (_event, studentId: number, academicYearId: number, currentTermId: number, comparisonTermId: number) => {
    return getService().getStudentPerformanceComparison(studentId, academicYearId, currentTermId, comparisonTermId);
  });

  safeHandleRaw('performance:getStruggling', (_event, academicYearId: number, termId: number, threshold?: number, streamId?: number) => {
    return getService().getStrugglingStudents(academicYearId, termId, threshold ?? 50, streamId);
  });

  safeHandleRaw('performance:getTrends', (_event, studentId: number, academicYearId: number, numTerms?: number) => {
    return getService().getPerformanceTrends(studentId, academicYearId, numTerms ?? 3);
  });
}
