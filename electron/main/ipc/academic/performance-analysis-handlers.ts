import { container } from '../../services/base/ServiceContainer';
import { ROLES, safeHandleRawWithRole } from '../ipc-result';

const getService = () => container.resolve('PerformanceAnalysisService');

export function registerPerformanceAnalysisHandlers() {
  safeHandleRawWithRole('performance:getMostImproved', ROLES.STAFF, (_event, params: {
    academicYearId: number;
    currentTermId: number;
    comparisonTermId: number;
    streamId?: number;
    minimumImprovement?: number;
  }) => {
    return getService().getMostImprovedStudents(params);
  });

  safeHandleRawWithRole(
    'performance:getComparison',
    ROLES.STAFF,
    (_event, studentId: number, academicYearId: number, currentTermId: number, comparisonTermId: number) => {
    return getService().getStudentPerformanceComparison(studentId, academicYearId, currentTermId, comparisonTermId);
  });

  safeHandleRawWithRole('performance:getStruggling', ROLES.STAFF, (_event, academicYearId: number, termId: number, threshold?: number, streamId?: number) => {
    return getService().getStrugglingStudents(academicYearId, termId, threshold ?? 50, streamId);
  });

  safeHandleRawWithRole('performance:getTrends', ROLES.STAFF, (_event, studentId: number, academicYearId: number, numTerms?: number) => {
    return getService().getPerformanceTrends(studentId, academicYearId, numTerms ?? 3);
  });
}
