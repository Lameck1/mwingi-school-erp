import { ipcMain } from '../../electron-env';
import { getDatabase } from '../../database';

export function registerAwardsHandlers() {
  ipcMain.handle('awards:assign', async (_event, params: {
    studentId: number;
    categoryId: number;
    academicYearId: number;
    termId: number;
  }) => {
    try {
      const db = getDatabase();
      const result = db.prepare(`
        INSERT INTO student_award (student_id, award_category_id, academic_year_id, term_id, award_date, approval_status)
        VALUES (?, ?, ?, ?, datetime('now'), 'pending')
      `).run(params.studentId, params.categoryId, params.academicYearId, params.termId);
      
      return { id: result.lastInsertRowid, status: 'success' };
    } catch (error) {
      throw new Error(`Failed to assign award: ${error.message}`);
    }
  });

  ipcMain.handle('awards:getStudentAwards', async (_event, studentId: number) => {
    try {
      const db = getDatabase();
      return db.prepare(`
        SELECT sa.*, ac.name as category_name, ac.category_type
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        WHERE sa.student_id = ?
        ORDER BY sa.award_date DESC
      `).all(studentId);
    } catch (error) {
      throw new Error(`Failed to get student awards: ${error.message}`);
    }
  });

  ipcMain.handle('awards:getAll', async (_event, params?: {
    status?: string;
    categoryId?: number;
  }) => {
    try {
      const db = getDatabase();
      let query = `
        SELECT sa.*, ac.name as category_name, ac.category_type, st.admission_number, st.first_name, st.last_name
        FROM student_award sa
        JOIN award_category ac ON sa.award_category_id = ac.id
        JOIN students st ON sa.student_id = st.id
        WHERE 1=1
      `;
      const args = [];
      
      if (params?.status) {
        query += ` AND sa.approval_status = ?`;
        args.push(params.status);
      }
      
      if (params?.categoryId) {
        query += ` AND sa.award_category_id = ?`;
        args.push(params.categoryId);
      }
      
      query += ` ORDER BY sa.award_date DESC`;
      
      return db.prepare(query).all(...args);
    } catch (error) {
      throw new Error(`Failed to get awards: ${error.message}`);
    }
  });

  ipcMain.handle('awards:approve', async (_event, awardId: number) => {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE student_award
        SET approval_status = 'approved', approved_at = datetime('now')
        WHERE id = ?
      `).run(awardId);
      
      return { status: 'success', message: 'Award approved' };
    } catch (error) {
      throw new Error(`Failed to approve award: ${error.message}`);
    }
  });

  ipcMain.handle('awards:delete', async (_event, awardId: number) => {
    try {
      const db = getDatabase();
      db.prepare(`DELETE FROM student_award WHERE id = ?`).run(awardId);
      
      return { status: 'success', message: 'Award deleted' };
    } catch (error) {
      throw new Error(`Failed to delete award: ${error.message}`);
    }
  });

  ipcMain.handle('awards:getCategories', async (_event) => {
    try {
      const db = getDatabase();
      return db.prepare(`
        SELECT * FROM award_category
        WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC
      `).all();
    } catch (error) {
      throw new Error(`Failed to get award categories: ${error.message}`);
    }
  });
}
