import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../../utils/format';

interface EligibleStudent {
  student_id: number;
  admission_number: string;
  full_name: string;
  current_grade: number;
  boarding_status: 'DAY' | 'BOARDER';
  outstanding_balance: number;
}

interface JSSFeeStructure {
  id: number;
  fiscal_year: number;
  jss_grade: number;
  tuition_fee: number;
  boarding_fee: number;
  activity_fee: number;
  total_fee: number;
}

interface TransitionResult {
  successful: EligibleStudent[];
  failed: Array<{
    student: EligibleStudent;
    reason: string;
  }>;
  total_processed: number;
}

const JSSTransition: React.FC = () => {
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

  useEffect(() => {
    loadEligibleStudents();
    loadFeeStructures();
  }, [filters]);

  const loadEligibleStudents = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getEligibleStudents(filters.from_grade, filters.academic_year);
      const students: EligibleStudent[] = result?.data || result || [];
      setEligibleStudents(students);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFeeStructures = async () => {
    try {
      // Load fee structures for each JSS grade
      const results = await Promise.all(
        [7, 8, 9].map(grade => window.electronAPI.getJSSFeeStructure(grade, filters.academic_year))
      );
      const structures: JSSFeeStructure[] = results
        .filter(r => r?.data)
        .map(r => r.data as JSSFeeStructure);
      setFeeStructures(structures);
    } catch (error) {
      console.error('Error loading fee structures:', error);
    }
  };

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
    if (selectedStudents.size === 0) {
      alert('Please select at least one student to process');
      return;
    }

    if (!confirm(`Process transition for ${selectedStudents.size} student(s) from Grade ${filters.from_grade} to Grade ${filters.to_grade}?`)) {
      return;
    }

    try {
      setProcessing(true);
      const result = await window.electronAPI.bulkTransition({
        student_ids: Array.from(selectedStudents),
        from_grade: filters.from_grade,
        to_grade: filters.to_grade,
        academic_year: filters.academic_year,
      });

      const successful = result?.data?.successful || eligibleStudents.filter(s => selectedStudents.has(s.student_id));
      const result: TransitionResult = {
        successful,
        failed: [],
        total_processed: selectedStudents.size
      };
      
      setTransitionResult(result);
      setSelectedStudents(new Set());
      
      alert(`Transition complete! ${result.successful.length} student(s) promoted successfully.`);
    } catch (error) {
      console.error('Error processing transition:', error);
      alert('Failed to process transition');
    } finally {
      setProcessing(false);
    }
  };

  const getCurrentFeeStructure = () => {
    return feeStructures.find(f => f.jss_grade === filters.to_grade && f.fiscal_year === filters.academic_year);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading JSS Transition Data...</div>;
  }

  const feeStructure = getCurrentFeeStructure();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">JSS Student Transition</h1>
        <p className="text-gray-600 mt-2">Automate grade promotions with fee structure updates</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="from_grade" className="block text-sm font-medium text-gray-700 mb-1">From Grade</label>
            <select
              id="from_grade"
              title="From Grade"
              value={filters.from_grade}
              onChange={(e) => setFilters({ ...filters, from_grade: parseInt(e.target.value) })}
              className="w-full border rounded px-3 py-2"
            >
              <option value={6}>Grade 6 (Primary)</option>
              <option value={7}>Grade 7 (JSS)</option>
              <option value={8}>Grade 8 (JSS)</option>
            </select>
          </div>
          <div>
            <label htmlFor="to_grade" className="block text-sm font-medium text-gray-700 mb-1">To Grade</label>
            <select
              id="to_grade"
              title="To Grade"
              value={filters.to_grade}
              onChange={(e) => setFilters({ ...filters, to_grade: parseInt(e.target.value) })}
              className="w-full border rounded px-3 py-2"
            >
              <option value={7}>Grade 7 (JSS)</option>
              <option value={8}>Grade 8 (JSS)</option>
              <option value={9}>Grade 9 (JSS)</option>
            </select>
          </div>
          <div>
            <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
            <select
              id="academic_year"
              title="Academic Year"
              value={filters.academic_year}
              onChange={(e) => setFilters({ ...filters, academic_year: parseInt(e.target.value) })}
              className="w-full border rounded px-3 py-2"
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">JSS Grade {feeStructure.jss_grade} Fee Structure ({feeStructure.fiscal_year})</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-700">Tuition:</span>
              <div className="font-semibold text-blue-900">{formatCurrency(feeStructure.tuition_fee)}</div>
            </div>
            <div>
              <span className="text-blue-700">Boarding:</span>
              <div className="font-semibold text-blue-900">{formatCurrency(feeStructure.boarding_fee)}</div>
            </div>
            <div>
              <span className="text-blue-700">Activity:</span>
              <div className="font-semibold text-blue-900">{formatCurrency(feeStructure.activity_fee)}</div>
            </div>
            <div>
              <span className="text-blue-700">Total:</span>
              <div className="font-semibold text-blue-900">{formatCurrency(feeStructure.total_fee)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Students List */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Eligible Students ({eligibleStudents.length})</h2>
            <p className="text-sm text-gray-600 mt-1">{selectedStudents.size} selected</p>
          </div>
          <button
            onClick={handleBatchTransition}
            disabled={selectedStudents.size === 0 || processing}
            className={`px-6 py-2 rounded font-medium ${
              selectedStudents.size > 0 && !processing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {processing ? 'Processing...' : `Promote ${selectedStudents.size} Student(s)`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Adm. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Student Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Current Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Boarding</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {eligibleStudents.map((student) => (
                <tr key={student.student_id} className="hover:bg-gray-50">
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
                      student.boarding_status === 'BOARDER' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {student.boarding_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={student.outstanding_balance > 0 ? 'text-red-600 font-semibold' : 'text-gray-900'}>
                      {formatCurrency(student.outstanding_balance)}
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
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
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
