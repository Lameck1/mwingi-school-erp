import { z } from 'zod';

import { getDatabase } from '../../database';
import { ROLES } from '../ipc-result';
import {
  AwardAssignSchema,
  AwardApproveSchema,
  AwardRejectSchema,
  AwardDeleteSchema,
  AwardGetAllSchema,
  AwardGetStudentAwardsSchema,
  AwardGetByIdSchema
} from '../schemas/academic-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

// Roles that can approve awards
const APPROVER_ROLES = new Set(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL']);
const SELECT_AWARD_STATUS = 'SELECT approval_status FROM student_award WHERE id = ?';
const AWARD_NOT_FOUND = 'Award not found';

export function registerAwardsHandlers() {
  const db = getDatabase();
  registerAwardMutationHandlers(db);
  registerAwardQueryHandlers(db);
}

function registerAwardMutationHandlers(db: ReturnType<typeof getDatabase>): void {
  validatedHandler('awards:assign', ROLES.STAFF, AwardAssignSchema, (event, params: z.infer<typeof AwardAssignSchema>, actor) => {
    // params is typed via schema inference but for explicit ness I used any or strict inferred type
    // In schema: userId and userRole optional.

    // Logic for auto-approve based on actor role
    const actorRole = actor.role;
    // Auto-approve if user is ADMIN/PRINCIPAL/DEPUTY_PRINCIPAL
    const autoApprove = APPROVER_ROLES.has(actorRole);
    const status = autoApprove ? 'approved' : 'pending';
    const approvedAt = autoApprove ? new Date().toISOString() : null;
    const approvedBy = autoApprove ? actor.id : null;

    const result = db.prepare(`
      INSERT INTO student_award (
        student_id, award_category_id, academic_year_id, term_id,
        awarded_date, remarks, approval_status, assigned_by_user_id,
        approved_by_user_id, approved_at
      )
      VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `).run(
      params.studentId, params.categoryId, params.academicYearId, params.termId || null,
      params.remarks || null, status, actor.id, approvedBy, approvedAt
    );

    return {
      id: result.lastInsertRowid,
      status: 'success',
      approval_status: status,
      auto_approved: autoApprove
    };
  });

  validatedHandler('awards:approve', ROLES.MANAGEMENT, AwardApproveSchema, (event, params, actor) => {
    // Verify the award exists and is in pending state
    const award = db.prepare(SELECT_AWARD_STATUS).get(params.awardId) as { approval_status: string } | undefined;
    if (!award) { throw new Error(AWARD_NOT_FOUND); }
    if (award.approval_status !== 'pending') {
      throw new Error(`Cannot approve award — current status is "${award.approval_status}"`);
    }

    db.prepare(`
      UPDATE student_award 
      SET approval_status = 'approved', 
          approved_by_user_id = ?, 
          approved_at = datetime('now')
      WHERE id = ?
    `).run(actor.id, params.awardId);

    return { status: 'success', message: 'Award approved successfully' };
  });

  validatedHandler('awards:reject', ROLES.MANAGEMENT, AwardRejectSchema, (event, params, actor) => {
    // Verify the award exists and is in pending state
    const award = db.prepare(SELECT_AWARD_STATUS).get(params.awardId) as { approval_status: string } | undefined;
    if (!award) { throw new Error(AWARD_NOT_FOUND); }
    if (award.approval_status !== 'pending') {
      throw new Error(`Cannot reject award — current status is "${award.approval_status}"`);
    }

    db.prepare(`
      UPDATE student_award 
      SET approval_status = 'rejected', 
          approved_by_user_id = ?, 
          approved_at = datetime('now'),
          rejection_reason = ?
      WHERE id = ?
    `).run(actor.id, params.reason, params.awardId);

    return { status: 'success', message: 'Award rejected' };
  });

  registerAwardDeleteHandler(db);
}

function registerAwardDeleteHandler(db: ReturnType<typeof getDatabase>): void {
  validatedHandlerMulti('awards:delete', ROLES.MANAGEMENT, AwardDeleteSchema, (event, [awardId]: [number, number?], _actor) => {
    const award = db.prepare(SELECT_AWARD_STATUS).get(awardId) as { approval_status: string } | undefined;
    if (!award) { throw new Error(AWARD_NOT_FOUND); }
    if (award.approval_status === 'approved') {
      throw new Error('Cannot delete an approved award — revoke it first');
    }
    db.prepare(`DELETE FROM student_award WHERE id = ?`).run(awardId);
    return { status: 'success', message: 'Award deleted' };
  });
}

function buildAwardQueryFilters(params?: {
  status?: string;
  categoryId?: number;
  academicYearId?: number;
  termId?: number;
}): { args: Array<number | string>; query: string } {
  let query = `
        SELECT 
          sa.*,
          ac.name as category_name, 
          ac.category_type,
          st.admission_number, 
          st.first_name, 
          st.last_name,
          st.first_name || ' ' || st.last_name as student_name,
          u1.full_name as assigned_by_name,
          u2.full_name as approved_by_name
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        JOIN student st ON sa.student_id = st.id
        LEFT JOIN user u1 ON sa.assigned_by_user_id = u1.id
        LEFT JOIN user u2 ON sa.approved_by_user_id = u2.id
        WHERE 1=1
      `;
  const args: Array<number | string> = [];

  if (params?.status && params?.status !== 'all') { // Optional chaining in case undefined
    query += ` AND sa.approval_status = ?`;
    args.push(params.status);
  }

  if (params?.categoryId) {
    query += ` AND sa.award_category_id = ?`;
    args.push(params.categoryId);
  }

  if (params?.academicYearId) {
    query += ` AND sa.academic_year_id = ?`;
    args.push(params.academicYearId);
  }

  if (params?.termId) {
    query += ` AND sa.term_id = ?`;
    args.push(params.termId);
  }

  query += ` ORDER BY sa.created_at DESC`;
  return { args, query };
}

function registerAwardQueryHandlers(db: ReturnType<typeof getDatabase>): void {
  validatedHandler('awards:getAll', ROLES.STAFF, AwardGetAllSchema, (_event, params) => {
    const { query, args } = buildAwardQueryFilters(params);
    return db.prepare(query).all(...args);
  });

  validatedHandler('awards:getPendingCount', ROLES.STAFF, z.undefined(), () => {
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM student_award WHERE approval_status = 'pending'
      `).get() as { count: number };
    return result.count;
  });

  validatedHandlerMulti('awards:getStudentAwards', ROLES.STAFF, AwardGetStudentAwardsSchema, (_event, [studentId]: [number]) => {
    return db.prepare(`
        SELECT sa.*, ac.name as category_name, ac.category_type
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        WHERE sa.student_id = ?
        ORDER BY sa.awarded_date DESC
      `).all(studentId);
  });

  validatedHandlerMulti('awards:getById', ROLES.STAFF, AwardGetByIdSchema, (_event, [awardId]: [number]) => {
    return db.prepare(`
        SELECT sa.*, ac.name as category_name, ac.category_type, 
               st.admission_number, st.first_name, st.last_name
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        JOIN student st ON sa.student_id = st.id
        WHERE sa.id = ?
      `).get(awardId);
  });

  validatedHandler('awards:getCategories', ROLES.STAFF, z.undefined(), () => {
    return db.prepare(`
        SELECT * FROM award_category
        WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC
      `).all();
  });
}
