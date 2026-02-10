import { Download, Printer, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';

import { PageHeader } from '../../components/patterns/PageHeader';
import { Select } from '../../components/ui/Select';
import { useAppStore } from '../../stores';
import { exportToPDF } from '../../utils/exporters';
import { printCurrentView } from '../../utils/print';

interface MeritListItem {
  position: number;
  admission_number: string;
  student_name: string;
  total_marks: number;
  average_marks: number;
  grade: string;
  percentage?: number;
}

const getGradeBadgeColor = (grade: string): string => {
  if (grade === 'A' || grade === 'A-') {
    return '#10b981';
  }
  if (grade === 'B+' || grade === 'B') {
    return '#3b82f6';
  }
  if (grade === 'B-' || grade === 'C+') {
    return '#f59e0b';
  }
  if (grade === 'C') {
    return '#ef4444';
  }
  return '#6b7280';
};

const MeritLists = () => {
  const { currentAcademicYear, currentTerm } = useAppStore();

  const [streams, setStreams] = useState<{ id: number; stream_name: string }[]>([]);
  const [meritList, setMeritList] = useState<MeritListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selectedStream, setSelectedStream] = useState<number>(0);

  useEffect(() => {
    void loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const streamsData = await window.electronAPI.getStreams();
      setStreams(streamsData);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const handleGenerate = async () => {
    if (!currentAcademicYear || !currentTerm || !selectedStream) {
      alert('Please select an academic year, term, and stream.');
      return;
    }

    setLoading(true);
    try {
      const list = await window.electronAPI.generateMeritList({
        academicYearId: currentAcademicYear.id,
        termId: currentTerm.id,
        streamId: selectedStream,
      });
      setMeritList(list);
    } catch (error) {
      console.error('Failed to generate merit list:', error);
      alert('Failed to generate merit list.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (meritList.length === 0) {
      alert('Please generate a merit list first');
      return;
    }

    setExporting(true);
    try {
      const streamName = streams.find(s => s.id === selectedStream)?.stream_name || 'Class';
      await exportToPDF({
        filename: `Merit_List_${streamName}_${currentTerm?.term_name}`,
        title: `Merit List - ${streamName}`,
        subtitle: `Academic Year: ${currentAcademicYear?.year_name} | Term: ${currentTerm?.term_name}`,
        columns: [
          { key: 'position', header: 'Position', width: 20 },
          { key: 'admission_number', header: 'Adm No', width: 30 },
          { key: 'student_name', header: 'Student Name', width: 60 },
          { key: 'total_marks', header: 'Total Marks', width: 30, align: 'right' },
          { key: 'average_marks', header: 'Average', width: 30, align: 'right' },
          { key: 'grade', header: 'Grade', width: 20, align: 'center' }
        ],
        data: meritList.map((row) => ({
          position: row.position,
          admission_number: row.admission_number,
          student_name: row.student_name,
          total_marks: row.total_marks,
          average_marks: row.average_marks.toFixed(2),
          grade: row.grade
        }))
      });
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (meritList.length === 0) {
      alert('Please generate a merit list first');
      return;
    }

    setExporting(true);
    try {
      const csvContent = [
        ['Position', 'Admission No', 'Student Name', 'Total Marks', 'Average', 'Grade'],
        ...meritList.map(item => [
          item.position,
          item.admission_number,
          item.student_name,
          item.total_marks,
          item.average_marks.toFixed(2),
          item.grade
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Merit_List_${currentTerm?.term_name}.csv`;
      a.click();
    } catch (error) {
      console.error('Failed to export Excel:', error);
      alert('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (meritList.length === 0) {
      alert('Please generate a merit list first');
      return;
    }
    printCurrentView({
      title: `Merit List - ${getStreamName()}`,
      selector: '#merit-list-print-area'
    });
  };

  const getStreamName = () => {
    return streams.find(s => s.id === selectedStream)?.stream_name || 'All Streams';
  };

  const renderMeritListContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 text-foreground/40">
          <p>Loading...</p>
        </div>
      );
    }

    if (meritList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-foreground/40">
          <p>No merit list generated yet. Select a stream and click "Generate Merit List".</p>
        </div>
      );
    }

    return (
      <div>
        <div className="mb-4 print:text-black">
          <h2 className="text-xl font-bold mb-2">Merit List - {getStreamName()}</h2>
          <p className="text-sm text-foreground/60">
            Academic Year: {currentAcademicYear?.year_name} | Term: {currentTerm?.term_name}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse print:text-black">
            <thead>
              <tr className="border-b border-white/10 print:border-black">
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Position</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Adm No.</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Name</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Total Marks</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Average</th>
                <th className="pb-4 pt-2 font-bold text-foreground/60 print:text-black">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-black">
              {meritList.map((row) => (
                <tr key={row.admission_number} className="group hover:bg-white/[0.02] transition-colors print:hover:bg-white">
                  <td className="py-4 pr-4 print:text-black">{row.position}</td>
                  <td className="py-4 pr-4 print:text-black">{row.admission_number}</td>
                  <td className="py-4 pr-4 print:text-black">{row.student_name}</td>
                  <td className="py-4 pr-4 print:text-black">{row.total_marks}</td>
                  <td className="py-4 pr-4 print:text-black">{row.average_marks.toFixed(2)}</td>
                  <td className="py-4 pr-4 print:text-black">
                    <span className="px-2 py-1 rounded text-sm font-semibold" style={{
                      backgroundColor: getGradeBadgeColor(row.grade),
                      color: 'white'
                    }}>
                      {row.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Merit Lists"
        subtitle="Generate and view student rankings for a class"
        breadcrumbs={[{ label: 'Academics' }, { label: 'Merit Lists' }]}
      />

      <div className="premium-card">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Select
            label="Stream"
            value={selectedStream}
            onChange={(val) => setSelectedStream(Number(val))}
            options={[
              { value: 0, label: 'Select stream...' },
              ...streams.map((s) => ({ value: s.id, label: s.stream_name })),
            ]}
          />
          <div className="md:col-span-2 lg:col-span-3 flex items-end gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Generating...' : 'Generate Merit List'}
            </button>
          </div>
        </div>
      </div>

      {meritList.length > 0 && (
        <div className="premium-card">
          <div className="flex gap-3 pb-4 border-b border-white/10">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="btn btn-secondary flex items-center gap-2"
              title="Export as PDF"
            >
              <FileText size={18} />
              Export PDF
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="btn btn-secondary flex items-center gap-2"
              title="Export as CSV/Excel"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="btn btn-secondary flex items-center gap-2"
              title="Print"
            >
              <Printer size={18} />
              Print
            </button>
          </div>
        </div>
      )}

      <div id="merit-list-print-area" className="premium-card min-h-[400px]">
        {renderMeritListContent()}
      </div>
    </div>
  );
};

export default MeritLists;
