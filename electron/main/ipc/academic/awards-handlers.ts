import { getDatabase } from '../../database';
import { safeHandleRaw } from '../ipc-result';

// Roles that can approve awards
const APPROVER_ROLES = new Set(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL']);
const SELECT_AWARD_STATUS = 'SELECT approval_status FROM student_award WHERE id = ?';
const AWARD_NOT_FOUND = 'Award not found';

interface AwardAssignParams {
  studentId: number;
  categoryId: number;
  academicYearId: number;
  termId?: number;
  userId: number;
  userRole: string;
  remarks?: string;
}

interface AwardApproveParams {
  awardId: number;
  userId: number;
}

interface AwardRejectParams {
  awardId: number;
  userId: number;
  reason: string;
}

export function registerAwardsHandlers() {
  const db = getDatabase();
  registerAwardMutationHandlers(db);
  registerAwardQueryHandlers(db);
}

function registerAwardMutationHandlers(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('awards:assign', (_event, params: AwardAssignParams) => {
    try {
      // Auto-approve if user is ADMIN/PRINCIPAL/DEPUTY_PRINCIPAL
      const autoApprove = APPROVER_ROLES.has(params.userRole);
      const status = autoApprove ? 'approved' : 'pending';
      const approvedAt = autoApprove ? new Date().toISOString() : null;
      const approvedBy = autoApprove ? params.userId : null;

      const result = db.prepare(`
        INSERT INTO student_award (
          student_id, award_category_id, academic_year_id, term_id,
          awarded_date, remarks, approval_status, assigned_by_user_id,
          approved_by_user_id, approved_at
        )
        VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
      `).run(
        params.studentId, params.categoryId, params.academicYearId, params.termId || null,
        params.remarks || null, status, params.userId, approvedBy, approvedAt
      );

      return {
        id: result.lastInsertRowid,
        status: 'success',
        approval_status: status,
        auto_approved: autoApprove
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to assign award: ${message}`);
    }
  });

  safeHandleRaw('awards:approve', (_event, params: AwardApproveParams) => {
    try {
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
      `).run(params.userId, params.awardId);

      return { status: 'success', message: 'Award approved successfully' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to approve award: ${message}`);
    }
  });

  // Reject an award
  safeHandleRaw('awards:reject', (_event, params: AwardRejectParams) => {
    try {
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
      `).run(params.userId, params.reason, params.awardId);

      return { status: 'success', message: 'Award rejected' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reject award: ${message}`);
    }
  });

  registerAwardDeleteHandler(db);
}

function registerAwardDeleteHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('awards:delete', (_event, awardId: number, _userId?: number) => {
    try {
      const award = db.prepare(SELECT_AWARD_STATUS).get(awardId) as { approval_status: string } | undefined;
      if (!award) { throw new Error(AWARD_NOT_FOUND); }
      if (award.approval_status === 'approved') {
        throw new Error('Cannot delete an approved award — revoke it first');
      }
      db.prepare(`DELETE FROM student_award WHERE id = ?`).run(awardId);
      return { status: 'success', message: 'Award deleted' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete award: ${message}`);
    }
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

  if (params?.status && params.status !== 'all') {
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
  safeHandleRaw('awards:getAll', (_event, params?: {
    status?: string;
    categoryId?: number;
    academicYearId?: number;
    termId?: number;
  }) => {
    try {
      const { query, args } = buildAwardQueryFilters(params);
      return db.prepare(query).all(...args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get awards: ${message}`);
    }
  });

  // Get pending awards count (for badge/notification)
  safeHandleRaw('awards:getPendingCount', () => {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM student_award WHERE approval_status = 'pending'
      `).get() as { count: number };
      return result.count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get pending count: ${message}`);
    }
  });

  // Get student awards
  safeHandleRaw('awards:getStudentAwards', (_event, studentId: number) => {
    try {
      return db.prepare(`
        SELECT sa.*, ac.name as category_name, ac.category_type
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        WHERE sa.student_id = ?
        ORDER BY sa.awarded_date DESC
      `).all(studentId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get student awards: ${message}`);
    }
  });

  // Get award by ID
  safeHandleRaw('awards:getById', (_event, awardId: number) => {
    try {
      return db.prepare(`
        SELECT sa.*, ac.name as category_name, ac.category_type, 
               st.admission_number, st.first_name, st.last_name
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        JOIN student st ON sa.student_id = st.id
        WHERE sa.id = ?
      `).get(awardId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get award: ${message}`);
    }
  });

  // Get award categories
  safeHandleRaw('awards:getCategories', () => {
    try {
      return db.prepare(`
        SELECT * FROM award_category
        WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC
      `).all();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get award categories: ${message}`);
    }
  });
}
