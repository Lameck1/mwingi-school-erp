import React, { useState, useEffect, useCallback } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
import { useAuthStore } from '../../../stores';
import { formatCurrencyFromCents } from '../../../utils/format';

import type { EligibleStudent, JSSFeeStructure, TransitionResult } from '../../../types/electron-api/JSSAPI';


const JSSTransition: React.FC = () => {
  const { user } = useAuthStore();
  const [eligibleStudents, setEligibleStudents] = useState<EligibleStudent[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [feeStructures, setFeeStructures] = useState<JSSFeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [transitionResult, setTransitionResult] = useState<TransitionResult | null>(null);
  
  const [filters, setFilters] = useState({
    from_grade: 6,
    to_grade: 7,
    academic_year: 2026
  });

  const loadEligibleStudents = useCallback(async () => {
    try {
      setLoading(true);
      const result = await globalThis.electronAPI.academic.getJSSEligibleStudents(filters.from_grade, filters.academic_year);
      const students: EligibleStudent[] = result?.data ?? [];
      setEligibleStudents(students);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadFeeStructures = useCallback(async () => {
    try {
      // Load fee structures for each JSS grade
      const results = await Promise.all(
        [7, 8, 9].map(grade => globalThis.electronAPI.academic.getJSSFeeStructure(grade, filters.academic_year))
      );
      const structures: JSSFeeStructure[] = results
        .map(r => r?.data)
        .filter((data): data is JSSFeeStructure => Boolean(data));
      setFeeStructures(structures);
    } catch (error) {
      console.error('Error loading fee structures:', error);
    }
  }, [filters.academic_year]);

  useEffect(() => {
    loadEligibleStudents().catch((err: unknown) => console.error('Failed to load students:', err));
    loadFeeStructures().catch((err: unknown) => console.error('Failed to load fee structures:', err));
  }, [loadEligibleStudents, loadFeeStructures]);

  const handleSelectAll = () => {
    if (selectedStudents.size === eligibleStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(eligibleStudents.map(s => s.student_id)));
    }
  };

  const handleSelectStudent = (studentId: number) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const handleBatchTransition = async () => {
    if (!user) {
      alert('User not authenticated');
      return;
    }

    if (selectedStudents.size === 0) {
      alert('Please select at least one student to process');
      return;
    }

    if (!confirm(`Process transition for ${selectedStudents.size} student(s) from Grade ${filters.from_grade} to Grade ${filters.to_grade}?`)) {
      return;
    }

    try {
      setProcessing(true);
      const result = await globalThis.electronAPI.academic.bulkJSSTransition({
        student_ids: Array.from(selectedStudents),
        from_grade: filters.from_grade,
        to_grade: filters.to_grade,
        transition_date: new Date().toISOString().slice(0, 10),
        processed_by: user.id
      });

      const successful = result?.data?.successful ?? Array.from(selectedStudents);
      const failed = result?.data?.failed ?? [];
      const transitionSummary: TransitionResult = { successful, failed };
      
      setTransitionResult(transitionSummary);
      setSelectedStudents(new Set());
      
      alert(`Transition complete! ${transitionSummary.successful.length} student(s) promoted successfully.`);
    } catch (error) {
      console.error('Error processing transition:', error);
      alert('Failed to process transition');
    } finally {
      setProcessing(false);
    }
  };

  const getCurrentFeeStructure = () => {
    return feeStructures.find(f => f.grade === filters.to_grade && f.fiscal_year === filters.academic_year);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading JSS Transition Data...</div>;
  }

  const feeStructure = getCurrentFeeStructure();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
            <HubBreadcrumb crumbs={[{ label: 'Academics', href: '/academics' }, { label: 'JSS Transition' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">JSS Student Transition</h1>
        <p className="text-muted-foreground mt-2">Automate grade promotions with fee structure updates</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="from_grade" className="block text-sm font-medium text-foreground/70 mb-1">From Grade</label>
            <select
              id="from_grade"
              title="From Grade"
              value={filters.from_grade}
              onChange={(e) => setFilters({ ...filters, from_grade: Number.parseInt(e.target.value, 10) })}
              className="w-full border border-border rounded px-3 py-2 bg-input text-foreground"
            >
              <option value={6}>Grade 6 (Primary)</option>
              <option value={7}>Grade 7 (JSS)</option>
              <option value={8}>Grade 8 (JSS)</option>
            </select>
          </div>
          <div>
            <label htmlFor="to_grade" className="block text-sm font-medium text-foreground/70 mb-1">To Grade</label>
            <select
              id="to_grade"
              title="To Grade"
              value={filters.to_grade}
              onChange={(e) => setFilters({ ...filters, to_grade: Number.parseInt(e.target.value, 10) })}
              className="w-full border border-border rounded px-3 py-2 bg-input text-foreground"
            >
              <option value={7}>Grade 7 (JSS)</option>
              <option value={8}>Grade 8 (JSS)</option>
              <option value={9}>Grade 9 (JSS)</option>
            </select>
          </div>
          <div>
            <label htmlFor="academic_year" className="block text-sm font-medium text-foreground/70 mb-1">Academic Year</label>
            <select
              id="academic_year"
              title="Academic Year"
              value={filters.academic_year}
              onChange={(e) => setFilters({ ...filters, academic_year: Number.parseInt(e.target.value, 10) })}
              className="w-full border border-border rounded px-3 py-2 bg-input text-foreground"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fee Structure Info */}
      {feeStructure && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2">JSS Grade {feeStructure.grade} Fee Structure ({feeStructure.fiscal_year})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-600 dark:text-blue-400">Tuition:</span>
              <div className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrencyFromCents(feeStructure.tuition_fee_cents)}</div>
            </div>
            <div>
              <span className="text-blue-600 dark:text-blue-400">Boarding:</span>
              <div className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrencyFromCents(feeStructure.boarding_fee_cents || 0)}</div>
            </div>
            <div>
              <span className="text-blue-600 dark:text-blue-400">Activity:</span>
              <div className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrencyFromCents(feeStructure.activity_fee_cents || 0)}</div>
            </div>
            <div>
              <span className="text-blue-600 dark:text-blue-400">Total:</span>
              <div className="font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrencyFromCents(
                  feeStructure.tuition_fee_cents +
                  (feeStructure.boarding_fee_cents || 0) +
                  (feeStructure.activity_fee_cents || 0) +
                  (feeStructure.exam_fee_cents || 0) +
                  (feeStructure.library_fee_cents || 0) +
                  (feeStructure.lab_fee_cents || 0) +
                  (feeStructure.ict_fee_cents || 0)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Students List */}
      <div className="bg-card rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 bg-secondary border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Eligible Students ({eligibleStudents.length})</h2>
            <p className="text-sm text-muted-foreground mt-1">{selectedStudents.size} selected</p>
          </div>
          <button
            onClick={handleBatchTransition}
            disabled={selectedStudents.size === 0 || processing}
            className={`px-6 py-2 rounded font-medium ${
              selectedStudents.size > 0 && !processing
                ? 'btn-primary'
                : 'bg-gray-300 text-muted-foreground cursor-not-allowed'
            }`}
          >
            {processing ? 'Processing...' : `Promote ${selectedStudents.size} Student(s)`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    title="Select all students"
                    aria-label="Select all students"
                    checked={selectedStudents.size === eligibleStudents.length}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground/70 uppercase">Adm. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground/70 uppercase">Student Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground/70 uppercase">Current Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground/70 uppercase">Boarding</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {eligibleStudents.map((student) => (
                <tr key={student.student_id} className="hover:bg-secondary">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      title={`Select ${student.full_name}`}
                      aria-label={`Select ${student.full_name}`}
                      checked={selectedStudents.has(student.student_id)}
                      onChange={() => handleSelectStudent(student.student_id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{student.admission_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{student.full_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">Grade {student.current_grade}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      student.boarding_status === 'BOARDER' ? 'bg-purple-100 text-purple-800' : 'bg-secondary text-foreground'
                    }`}>
                      {student.boarding_status === 'DAY_SCHOLAR' ? 'DAY SCHOLAR' : student.boarding_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={student.outstanding_balance_cents > 0 ? 'text-red-600 font-semibold' : 'text-foreground'}>
                      {formatCurrencyFromCents(student.outstanding_balance_cents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transition Result */}
      {transitionResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-4">✓ Transition Complete!</h3>
          <p className="text-green-800 mb-2">
            Successfully promoted {transitionResult.successful.length} student(s) from Grade {filters.from_grade} to Grade {filters.to_grade}.
          </p>
          {transitionResult.failed.length > 0 && (
            <p className="text-red-800">
              {transitionResult.failed.length} student(s) failed promotion. Please review individual records.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default JSSTransition;
