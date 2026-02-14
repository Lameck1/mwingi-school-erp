import { getDatabase } from '../../database';
import { getSession } from '../../security/session';
import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

const getService = () => container.resolve('MeritListService');

interface ExamInfo {
  academic_year_id: number;
  term_id: number;
}

interface ImprovementRecord {
  term_id: number;
  term_name: string;
  average_score: number;
  academic_year_id: number;
}

function getPerformanceImprovement(studentId: number) {
  const db = getDatabase();
  const improvements = db.prepare(`
    SELECT 
      e.term_id,
      t.term_name,
      rcs.mean_score as average_score,
      e.academic_year_id
    FROM report_card_summary rcs
    JOIN exam e ON rcs.exam_id = e.id
    JOIN term t ON e.term_id = t.id
    WHERE rcs.student_id = ?
    ORDER BY e.academic_year_id DESC, t.term_number DESC
    LIMIT 6
  `).all(studentId) as ImprovementRecord[];

  if (improvements.length < 2) {
    return [];
  }

  const result = [];
  for (let i = 0; i < improvements.length - 1; i++) {
    const current = improvements[i];
    const previous = improvements[i + 1];
    const improvementPoints = current.average_score - previous.average_score;
    const improvementPercentage = previous.average_score > 0
      ? (improvementPoints / previous.average_score) * 100
      : 0;

    result.push({
      term_name: current.term_name,
      previous_average: previous.average_score,
      current_average: current.average_score,
      improvement_points: improvementPoints,
      improvement_percentage: improvementPercentage
    });
  }

  return result;
}

export function registerMeritListHandlers() {
  safeHandleRaw('merit-list:generate', async (_event, options: { academicYearId: number; termId: number; streamId: number }) => {
    try {
      return await getService().generateMeritList(options);
    } catch (error) {
      throw new Error(`Failed to generate merit list: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('merit-list:getClass', async (_event, examId: number, streamId: number) => {
    try {
      const db = getDatabase();
      const examInfo = db.prepare(
        'SELECT academic_year_id, term_id FROM exam WHERE id = ?'
      ).get(examId) as ExamInfo | undefined;

      if (!examInfo) {
        throw new Error('Exam not found');
      }

      const session = await getSession();
      const userId = session?.user.id ?? 1;

      return await getService().generateClassMeritList(
        examInfo.academic_year_id, examInfo.term_id, streamId, examId, userId
      );
    } catch (error) {
      throw new Error(`Failed to generate class merit list: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('merit-list:getImprovement', (_event, studentId: number) => {
    try {
      return getPerformanceImprovement(studentId);
    } catch (error) {
      throw new Error(`Failed to get performance improvement: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('merit-list:getSubject', async (_event, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectMeritList(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject merit list: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('merit-list:getSubjectDifficulty', async (_event, payload: { examId: number; subjectId: number; streamId: number }) => {
    try {
      return await getService().getSubjectDifficulty(payload.examId, payload.subjectId, payload.streamId);
    } catch (error) {
      throw new Error(`Failed to get subject difficulty: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('merit-list:getMostImproved', async (_event, payload: {
    academicYearId: number;
    currentTermId: number;
    comparisonTermId: number;
    streamId?: number;
    minimumImprovement?: number;
  }) => {
    try {
      const results = await getService().calculatePerformanceImprovements(
        payload.academicYearId, payload.currentTermId, payload.comparisonTermId, payload.streamId
      );
      const threshold = payload.minimumImprovement ?? 0;
      return results.filter(r => r.improvement_percentage >= threshold);
    } catch (error) {
      throw new Error(`Failed to get most improved students: ${(error as Error).message}`);
    }
  });
}
