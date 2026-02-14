import { getDatabase } from '../../database';

export interface GradeTransition {
  id: number;
  student_id: number;
  from_grade: number;
  to_grade: number;
  transition_date: string;
  old_fee_structure_id?: number;
  new_fee_structure_id: number;
  outstanding_balance_cents: number;
  boarding_status_change?: 'TO_BOARDER' | 'TO_DAY_SCHOLAR' | 'NO_CHANGE';
  transition_notes?: string;
  processed_by: number;
  created_at: string;
}

export interface JSSFeeStructure {
  id: number;
  grade: number;
  fiscal_year: number;
  tuition_fee_cents: number;
  boarding_fee_cents?: number;
  activity_fee_cents?: number;
  exam_fee_cents?: number;
  library_fee_cents?: number;
  lab_fee_cents?: number;
  ict_fee_cents?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransitionSummary {
  fiscal_year: number;
  total_transitions: number;
  grade_6_to_7: number;
  grade_7_to_8: number;
  grade_8_to_9: number;
  to_boarder_count: number;
  to_day_scholar_count: number;
  avg_outstanding_balance_cents: number;
  total_outstanding_balance_cents: number;
}

export interface StudentTransitionStatus {
  student_id: number;
  admission_number: string;
  full_name: string;
  current_grade: number;
  eligible_for_transition: boolean;
  transition_to_grade: number;
  outstanding_balance_cents: number;
  boarding_status: 'BOARDER' | 'DAY_SCHOLAR';
  recommended_fee_structure: JSSFeeStructure | null;
}

/**
 * Service for managing JSS (Junior Secondary School) transitions
 * 
 * Capabilities:
 * - Automate Grade 6→7, 7→8, 8→9 transitions
 * - Apply appropriate fee structures for JSS grades
 * - Handle boarding status changes during transition
 * - Track outstanding balances across grade transitions
 * - Generate transition reports
 */
export class JSSTransitionService {
  private get db() { return getDatabase(); }

  /**
   * Get JSS fee structure for a specific grade and year
   */
  getJSSFeeStructure(grade: number, fiscalYear: number): JSSFeeStructure | null {
    if (grade < 7 || grade > 9) {
      throw new Error('JSS grades are 7, 8, and 9 only');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM jss_fee_structure
      WHERE grade = ? AND fiscal_year = ? AND is_active = 1
      LIMIT 1
    `);

    const feeStructure = stmt.get(grade, fiscalYear) as JSSFeeStructure | undefined;
    return feeStructure ?? null;
  }

  /**
   * Get all JSS fee structures for a fiscal year
   */
  getAllJSSFeeStructures(fiscalYear: number): JSSFeeStructure[] {
    const stmt = this.db.prepare(`
      SELECT * FROM jss_fee_structure
      WHERE fiscal_year = ? AND is_active = 1
      ORDER BY grade
    `);

    return stmt.all(fiscalYear) as JSSFeeStructure[];
  }

  /**
   * Process grade transition for a student
   */
  processStudentTransition(data: {
    student_id: number;
    from_grade: number;
    to_grade: number;
    transition_date: string;
    boarding_status_change?: 'TO_BOARDER' | 'TO_DAY_SCHOLAR' | 'NO_CHANGE';
    transition_notes?: string;
    processed_by: number;
  }): number {
    this.validateTransition(data.from_grade, data.to_grade);

    // Get current fiscal year from transition date
    const transitionYear = new Date(data.transition_date).getFullYear();

    // Get appropriate fee structure
    const feeStructure = this.getJSSFeeStructure(data.to_grade, transitionYear);
    if (!feeStructure) {
      throw new Error(`No JSS fee structure found for grade ${data.to_grade}, year ${transitionYear}`);
    }

    // Calculate outstanding balance for student
    const outstandingBalance = this.getStudentOutstandingBalance(data.student_id);

    // Create transition record
    const stmt = this.db.prepare(`
      INSERT INTO grade_transition (
        student_id, from_grade, to_grade, transition_date,
        new_fee_structure_id, outstanding_balance_cents,
        boarding_status_change, transition_notes, processed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.student_id,
      data.from_grade,
      data.to_grade,
      data.transition_date,
      feeStructure.id,
      outstandingBalance,
      data.boarding_status_change || 'NO_CHANGE',
      data.transition_notes || null,
      data.processed_by
    );

    const transitionId = result.lastInsertRowid as number;

    // Update student's enrollment stream to match new grade if possible
    const currentEnrollment = this.db.prepare(`
      SELECT e.id as enrollment_id, e.stream_id, e.student_type, s.is_active
      FROM enrollment e
      JOIN student s ON e.student_id = s.id
      WHERE e.student_id = ? AND e.status = 'ACTIVE'
      ORDER BY e.enrollment_date DESC
      LIMIT 1
    `).get(data.student_id) as { enrollment_id: number; stream_id: number; student_type: string; is_active: number } | undefined;

    if (currentEnrollment) {
      const targetStream = this.db.prepare(`
        SELECT id FROM stream WHERE level_order = ? AND is_active = 1 ORDER BY id LIMIT 1
      `).get(data.to_grade) as { id: number } | undefined;

      const newStreamId = targetStream?.id ?? currentEnrollment.stream_id;

      this.db.prepare(`
        UPDATE enrollment
        SET stream_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStreamId, currentEnrollment.enrollment_id);
    }

    // Update boarding status if changed
    if (data.boarding_status_change && data.boarding_status_change !== 'NO_CHANGE') {
      const newStatus = data.boarding_status_change === 'TO_BOARDER' ? 'BOARDER' : 'DAY_SCHOLAR';
      this.db.prepare(`
        UPDATE student
        SET student_type = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, data.student_id);
    }

    return transitionId;
  }

  private validateTransition(fromGrade: number, toGrade: number): void {
    if (toGrade !== fromGrade + 1) {
      throw new Error('Invalid transition: Can only promote to next grade');
    }

    if (toGrade < 7 || toGrade > 9) {
      throw new Error('JSS transitions are for grades 7-9 only');
    }
  }

  /**
   * Calculate student's outstanding balance
   */
  private getStudentOutstandingBalance(studentId: number): number {
    const stmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount - amount_paid), 0) as balance
      FROM fee_invoice
      WHERE student_id = ?
    `);

    const result = stmt.get(studentId) as { balance: number };
    return result.balance;
  }

  /**
   * Get students eligible for JSS transition
   */
  getEligibleStudentsForTransition(
    fromGrade: number,
    fiscalYear: number
  ): StudentTransitionStatus[] {
    const toGrade = fromGrade + 1;

    // Only JSS grades
    if (toGrade < 7 || toGrade > 9) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT 
        s.id as student_id,
        s.admission_number as admission_number,
        s.first_name || ' ' || s.last_name as full_name,
        st.level_order as current_grade,
        COALESCE(e.student_type, s.student_type) as current_boarding_status
      FROM student s
      JOIN enrollment e ON s.id = e.student_id
      JOIN stream st ON e.stream_id = st.id
      WHERE st.level_order = ? AND e.status = 'ACTIVE' AND s.is_active = 1
      ORDER BY s.last_name, s.first_name
    `);

    interface EligibleStudentResult {
      student_id: number;
      admission_number: string;
      full_name: string;
      current_grade: number;
      current_boarding_status: 'BOARDER' | 'DAY_SCHOLAR';
    }

    const students = stmt.all(fromGrade) as EligibleStudentResult[];
    const feeStructure = this.getJSSFeeStructure(toGrade, fiscalYear);

    return students.map(student => ({
      student_id: student.student_id,
      admission_number: student.admission_number,
      full_name: student.full_name,
      current_grade: student.current_grade,
      eligible_for_transition: true,
      transition_to_grade: toGrade,
      outstanding_balance_cents: this.getStudentOutstandingBalance(student.student_id),
      boarding_status: student.current_boarding_status,
      recommended_fee_structure: feeStructure,
    }));
  }

  /**
   * Batch process multiple student transitions
   */
  batchProcessTransitions(data: {
    student_ids: number[];
    from_grade: number;
    to_grade: number;
    transition_date: string;
    processed_by: number;
  }): {
    successful: number[];
    failed: { student_id: number; error: string }[];
  } {
    const successful: number[] = [];
    const failed: { student_id: number; error: string }[] = [];

    for (const studentId of data.student_ids) {
      try {
        const _transitionId = this.processStudentTransition({
          student_id: studentId,
          from_grade: data.from_grade,
          to_grade: data.to_grade,
          transition_date: data.transition_date,
          processed_by: data.processed_by,
        });
        successful.push(studentId);
      } catch (error) {
        failed.push({
          student_id: studentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Get transition history for a student
   */
  getStudentTransitionHistory(studentId: number): GradeTransition[] {
    const stmt = this.db.prepare(`
      SELECT * FROM grade_transition
      WHERE student_id = ?
      ORDER BY transition_date DESC
    `);

    return stmt.all(studentId) as GradeTransition[];
  }

  /**
   * Get transition summary for a fiscal year
   */
  getTransitionSummary(fiscalYear: number): TransitionSummary {
    const startDate = `${fiscalYear}-01-01`;
    const endDate = `${fiscalYear}-12-31`;

    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_transitions,
        SUM(CASE WHEN from_grade = 6 AND to_grade = 7 THEN 1 ELSE 0 END) as grade_6_to_7,
        SUM(CASE WHEN from_grade = 7 AND to_grade = 8 THEN 1 ELSE 0 END) as grade_7_to_8,
        SUM(CASE WHEN from_grade = 8 AND to_grade = 9 THEN 1 ELSE 0 END) as grade_8_to_9,
        SUM(CASE WHEN boarding_status_change = 'TO_BOARDER' THEN 1 ELSE 0 END) as to_boarder_count,
        SUM(CASE WHEN boarding_status_change = 'TO_DAY_SCHOLAR' THEN 1 ELSE 0 END) as to_day_scholar_count,
        AVG(outstanding_balance_cents) as avg_outstanding_balance_cents,
        SUM(outstanding_balance_cents) as total_outstanding_balance_cents
      FROM grade_transition
      WHERE transition_date BETWEEN ? AND ?
    `);

    interface TransitionSummaryResult {
      total_transitions: number;
      grade_6_to_7: number;
      grade_7_to_8: number;
      grade_8_to_9: number;
      to_boarder_count: number;
      to_day_scholar_count: number;
      avg_outstanding_balance_cents: number | null;
      total_outstanding_balance_cents: number | null;
    }

    const result = stmt.get(startDate, endDate) as TransitionSummaryResult;

    return {
      fiscal_year: fiscalYear,
      total_transitions: result.total_transitions || 0,
      grade_6_to_7: result.grade_6_to_7 || 0,
      grade_7_to_8: result.grade_7_to_8 || 0,
      grade_8_to_9: result.grade_8_to_9 || 0,
      to_boarder_count: result.to_boarder_count || 0,
      to_day_scholar_count: result.to_day_scholar_count || 0,
      avg_outstanding_balance_cents: result.avg_outstanding_balance_cents || 0,
      total_outstanding_balance_cents: result.total_outstanding_balance_cents || 0,
    };
  }

  /**
   * Create or update JSS fee structure
   */
  setJSSFeeStructure(data: {
    grade: number;
    fiscal_year: number;
    tuition_fee_cents: number;
    boarding_fee_cents?: number;
    activity_fee_cents?: number;
    exam_fee_cents?: number;
    library_fee_cents?: number;
    lab_fee_cents?: number;
    ict_fee_cents?: number;
  }): number {
    if (data.grade < 7 || data.grade > 9) {
      throw new Error('JSS grades are 7, 8, and 9 only');
    }

    // Deactivate existing fee structure for this grade/year
    const deactivateStmt = this.db.prepare(`
      UPDATE jss_fee_structure
      SET is_active = 0, updated_at = datetime('now')
      WHERE grade = ? AND fiscal_year = ?
    `);
    deactivateStmt.run(data.grade, data.fiscal_year);

    // Insert new fee structure
    const stmt = this.db.prepare(`
      INSERT INTO jss_fee_structure (
        grade, fiscal_year, tuition_fee_cents, boarding_fee_cents,
        activity_fee_cents, exam_fee_cents, library_fee_cents,
        lab_fee_cents, ict_fee_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.grade,
      data.fiscal_year,
      data.tuition_fee_cents,
      data.boarding_fee_cents || null,
      data.activity_fee_cents || null,
      data.exam_fee_cents || null,
      data.library_fee_cents || null,
      data.lab_fee_cents || null,
      data.ict_fee_cents || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get total JSS fee for a student based on grade and boarding status
   */
  calculateJSSFeeForStudent(
    grade: number,
    fiscalYear: number,
    isBoarder: boolean
  ): number {
    const feeStructure = this.getJSSFeeStructure(grade, fiscalYear);
    
    if (!feeStructure) {
      throw new Error(`No fee structure found for grade ${grade}, year ${fiscalYear}`);
    }

    let total = feeStructure.tuition_fee_cents;

    if (isBoarder && feeStructure.boarding_fee_cents) {
      total += feeStructure.boarding_fee_cents;
    }

    total += feeStructure.activity_fee_cents || 0;
    total += feeStructure.exam_fee_cents || 0;
    total += feeStructure.library_fee_cents || 0;
    total += feeStructure.lab_fee_cents || 0;
    total += feeStructure.ict_fee_cents || 0;

    return total;
  }
}
