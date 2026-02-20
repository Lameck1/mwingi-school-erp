import { getDatabase } from '../../database';
import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import {
  MeritListGenerateSchema,
  MeritListClassSchema,
  MeritListImprovementSchema,
  MeritListSubjectSchema,
  MeritListSubjectDifficultySchema,
  MeritListMostImprovedSchema
} from '../schemas/academic-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

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
    if (!current || !previous) { continue; }
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
  validatedHandler('merit-list:generate', ROLES.STAFF, MeritListGenerateSchema, async (_event, options) => {
    // options is { academicYearId: number; termId: number; streamId: number }
    // Service expects same shape?
    // Check service usage in original code: await getService().generateMeritList(options);
    // Assuming service accepts camelCase or we map it. 
    // MeritListGenerateSchema uses camelCase keys.
    return await getService().generateMeritList(options);
  });

  validatedHandlerMulti('merit-list:getClass', ROLES.STAFF, MeritListClassSchema, async (event, [examId, streamId]: [number, number, number?], actor) => {
    const db = getDatabase();
    const examInfo = db.prepare(
      'SELECT academic_year_id, term_id FROM exam WHERE id = ?'
    ).get(examId) as ExamInfo | undefined;

    if (!examInfo) {
      throw new Error('Exam not found');
    }

    return await getService().generateClassMeritList(
      examInfo.academic_year_id, examInfo.term_id, streamId, examId, actor.id
    );
  });

  validatedHandlerMulti('merit-list:getImprovement', ROLES.STAFF, MeritListImprovementSchema, (_event, [studentId]: [number]) => {
    return getPerformanceImprovement(studentId);
  });

  validatedHandler('merit-list:getSubject', ROLES.STAFF, MeritListSubjectSchema, async (_event, payload) => {
    return await getService().getSubjectMeritList(payload.examId, payload.subjectId, payload.streamId);
  });

  validatedHandler('merit-list:getSubjectDifficulty', ROLES.STAFF, MeritListSubjectDifficultySchema, async (_event, payload) => {
    return await getService().getSubjectDifficulty(payload.examId, payload.subjectId, payload.streamId);
  });

  validatedHandler('merit-list:getMostImproved', ROLES.STAFF, MeritListMostImprovedSchema, async (_event, payload) => {
    // payload matches structure
    const results = await getService().calculatePerformanceImprovements(
      payload.academicYearId, payload.currentTermId, payload.comparisonTermId, payload.streamId
    );
    const threshold = payload.minimumImprovement ?? 0;
    return results.filter(r => r.improvement_percentage >= threshold);
  });
}
