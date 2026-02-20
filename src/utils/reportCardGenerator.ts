import type { ReportCardData } from '../types/electron-api/ReportsAPI'

// Helper for grade bar color
const getGradeColor = (grade: string) => {
    if (grade.startsWith('E')) { return '#10b981' } // Excellent (Green)
    if (grade.startsWith('M')) { return '#3b82f6' } // Meeting (Blue)
    if (grade.startsWith('A')) { return '#f59e0b' } // Approaching (Orange)
    return '#ef4444' // Below (Red)
}

export const generateReportCardHTML = (data: ReportCardData, nextTermDate?: string) => {
    const schoolName = data.school?.name || 'MWINGI ADVENTIST SCHOOL'
    const address = data.school?.address || 'P.O. Box 123, Mwingi, Kenya'
    const phone = data.school?.phone || '+254 700 000 000'
    const email = data.school?.email || 'info@mwingiadventist.ac.ke'
    const motto = data.school?.motto ? `"${data.school.motto}"` : ''

    const primaryColor = '#1e3a8a'
    const accentColor = '#3b82f6'

    const gradeRows = data.grades.map((g, i) => {
        return `
        <tr style="background-color: ${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
            <td style="font-weight: 500">${g.subject_name}</td>
            <td style="text-align: center; color: #64748b">${g.cat1 || '-'}</td>
            <td style="text-align: center; color: #64748b">${g.cat2 || '-'}</td>
            <td style="text-align: center; color: #64748b">${g.midterm || '-'}</td>
            <td style="text-align: center; color: #64748b">${g.final_exam || '-'}</td>
            <td style="text-align: center; font-weight: bold">${g.average.toFixed(0)}</td>
            <td style="text-align: center; font-weight: bold; color: ${primaryColor}">${g.grade_letter}</td>
        </tr>`
    }).join('')

    // Performance Chart items
    const chartItems = data.grades.map(g => {
        const w = Math.min(100, Math.max(5, g.average))
        const c = getGradeColor(g.grade_letter)
        return `
            <div class="chart-item">
                <div class="chart-label">${g.subject_code || g.subject_name.substring(0, 3)}</div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="width: ${w}%; background-color: ${c};"></div>
                </div>
            </div>
        `
    }).join('')

    return `<!DOCTYPE html>
<html>
<head>
    <title>Report Card - ${data.student.admission_number}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; 
            color: #1e293b; 
            background: white; 
            padding: 7mm; /* Reduced from 8mm */
            max-width: 210mm; 
            margin: 0 auto;
            font-size: 10px; /* Reduced to 10px */
            line-height: 1.35;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }
        @media print { body { padding: 7mm; } @page { margin: 0; size: A4; } }

        .watermark {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 320px; height: 320px; opacity: 0.04; z-index: -1;
            background-image: url('${data.school?.logo || ''}');
            background-repeat: no-repeat; background-position: center; background-size: contain;
            filter: grayscale(100%);
        }

        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; }
        .header-logo { width: 65px; height: 65px; object-fit: contain; }
        .header-center { flex: 1; text-align: center; padding: 0 10px; }
        .header-photo { width: 55px; height: 68px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        
        .school-name { font-size: 16px; font-weight: 800; color: ${primaryColor}; text-transform: uppercase; letter-spacing: -0.5px; margin-bottom: 2px; }
        .motto { font-style: italic; color: #64748b; font-family: 'Times New Roman', serif; font-size: 10px; margin-bottom: 2px; }
        .contact { font-size: 8px; color: #64748b; }

        .title-bar { 
            background: ${primaryColor}; color: white; padding: 5px 0; text-align: center; 
            font-weight: 700; text-transform: uppercase; margin: 8px 0 12px 0; 
            font-size: 11px; letter-spacing: 1.5px; border-radius: 2px;
        }

        .student-info { 
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; 
            margin-bottom: 15px; padding: 8px; background: #f8fafc; 
            border: 1px solid #e2e8f0; border-radius: 6px;
        }
        .info-item { display: flex; flex-direction: column; }
        .info-lbl { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 2px; }
        .info-val { font-size: 11px; font-weight: 700; color: #0f172a; }

        /* Scorecard */
        .scorecard { 
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px; 
        }
        .score-card { 
            border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; 
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .score-label { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 3px; }
        .score-value { font-size: 16px; font-weight: 800; color: ${primaryColor}; }
        .score-sub { font-size: 9px; color: #94a3b8; }

        /* Attendance Bar */
        .attendance-track { width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; margin-top: 3px; overflow: hidden; }
        .attendance-fill { height: 100%; background: ${accentColor}; border-radius: 3px; }

        /* Table */
        table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 15px; font-size: 10px; }
        th { 
            background: #f1f5f9; color: #475569; padding: 6px 6px; text-align: left; 
            font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; 
            border-bottom: 2px solid #e2e8f0; border-top: 1px solid #e2e8f0;
        }
        th:first-child { border-left: 1px solid #e2e8f0; border-top-left-radius: 4px; }
        th:last-child { border-right: 1px solid #e2e8f0; border-top-right-radius: 4px; }
        
        td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: middle; }
        td:first-child { border-left: 1px solid #e2e8f0; }
        td:last-child { border-right: 1px solid #e2e8f0; }
        tr:last-child td:first-child { border-bottom-left-radius: 4px; }
        tr:last-child td:last-child { border-bottom-right-radius: 4px; }

        .grade-totals { background: #f8fafc; font-weight: 700; color: #334155; }
        .grade-totals td { border-top: 2px solid #e2e8f0; }

        /* Performance Chart */
        .chart-section { margin-top: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; page-break-inside: avoid; }
        .chart-title { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
        .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20px, 1fr)); gap: 6px; align-items: flex-end; height: 70px; }
        .chart-item { display: flex; flex-direction: column; align-items: center; height: 100%; }
        .chart-bar-bg { width: 10px; height: 100%; background: #f1f5f9; border-radius: 2px; position: relative; display: flex; align-items: flex-end; }
        .chart-bar-fill { width: 100%; border-radius: 2px; min-height: 2px; }
        .chart-label { font-size: 7px; color: #64748b; margin-top: 3px; transform: rotate(-45deg); white-space: nowrap; transform-origin: center; margin-bottom: 2px; }

        .remarks-group { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; page-break-inside: avoid; }
        .remark-box { 
            border: 1px solid #e2e8f0; background: #fafafa; padding: 8px; border-radius: 4px; 
            min-height: 50px; position: relative;
        }
        .remark-title { 
            position: absolute; top: -7px; left: 8px; background: white; padding: 0 4px; 
            font-size: 8px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; 
        }
        .remark-text { font-style: italic; color: #334155; font-size: 10px; margin-top: 3px; }

        .signatures { display: flex; justify-content: space-between; margin-top: 25px; page-break-inside: avoid; }
        .sig-block { text-align: center; width: 160px; }
        .sig-line { border-bottom: 1px dotted #94a3b8; height: 25px; margin-bottom: 4px; }
        .sig-lbl { font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; }

        .opening-date { 
            text-align: center; margin-top: 15px; padding-top: 8px; border-top: 1px solid #e2e8f0; 
            font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="watermark"></div>

    <div class="header">
        ${data.school?.logo ? `<img src="${data.school.logo}" class="header-logo" />` : '<div style="width:70px"></div>'}
        <div class="header-center">
            <div class="school-name">${schoolName}</div>
            ${motto ? `<div class="motto">${motto}</div>` : ''}
            <div class="contact">${address} | ${phone}<br/>${email}</div>
        </div>
        ${data.student.photo ? `<img src="${data.student.photo}" class="header-photo" />` : '<div style="width:60px"></div>'}
    </div>

    <div class="title-bar">STUDENT REPORT CARD</div>

    <div class="student-info">
        <div class="info-item">
            <span class="info-lbl">Student Name</span>
            <span class="info-val">${data.student.first_name} ${data.student.last_name}</span>
        </div>
        <div class="info-item">
            <span class="info-lbl">Admission No</span>
            <span class="info-val">${data.student.admission_number}</span>
        </div>
        <div class="info-item">
            <span class="info-lbl">Class / Stream</span>
            <span class="info-val">${data.student.stream_name}</span>
        </div>
        <div class="info-item">
            <span class="info-lbl">Term / Year</span>
            <span class="info-val">${data.term} ${data.academic_year}</span>
        </div>
    </div>

    <div class="scorecard">
        <div class="score-card">
            <span class="score-label">Total Marks</span>
            <span class="score-value">${data.summary.total_marks}</span>
            <span class="score-sub">Out of ${data.grades.length * 100}</span>
        </div>
        <div class="score-card">
            <span class="score-label">Mean Score</span>
            <span class="score-value">${data.summary.average}%</span>
            <span class="score-sub">Points</span>
        </div>
        <div class="score-card">
            <span class="score-label">Mean Grade</span>
            <span class="score-value" style="color:${accentColor}">${data.summary.grade}</span>
            <span class="score-sub">Performance</span>
        </div>
        <div class="score-card">
            <span class="score-label">Rank</span>
            <span class="score-value" style="color:#0f172a">${data.summary.position || '-'}</span>
            <span class="score-sub">Out of ${data.summary.class_size}</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Subject</th>
                <th style="text-align:center">CAT 1</th>
                <th style="text-align:center">CAT 2</th>
                <th style="text-align:center">MID</th>
                <th style="text-align:center">END</th>
                <th style="text-align:center">AVG</th>
                <th style="text-align:center">Grade</th>
                <!-- Remarks removed from column header -->
            </tr>
        </thead>
        <tbody>
            ${gradeRows}
        </tbody>
        <tfoot>
            ${(() => {
            const t = { cat1: 0, cat2: 0, mid: 0, end: 0, avg: 0, n: 0 }
            data.grades.forEach(g => {
                if (g.cat1) { t.cat1 += g.cat1 }
                if (g.cat2) { t.cat2 += g.cat2 }
                if (g.midterm) { t.mid += g.midterm }
                if (g.final_exam) { t.end += g.final_exam }
                t.avg += g.average
                t.n++
            })
            const cnt = t.n || 1
            return `
                <tr class="grade-totals">
                    <td>TOTALS</td>
                    <td style="text-align:center">${t.cat1 > 0 ? t.cat1 : '-'}</td>
                    <td style="text-align:center">${t.cat2 > 0 ? t.cat2 : '-'}</td>
                    <td style="text-align:center">${t.mid > 0 ? t.mid : '-'}</td>
                    <td style="text-align:center">${t.end > 0 ? t.end : '-'}</td>
                    <td style="text-align:center">${t.avg > 0 ? t.avg.toFixed(0) : '-'}</td>
                    <td></td>
                </tr>
                <tr class="grade-totals" style="color: #475569; background: #fff;">
                    <td>AVERAGES</td>
                    <td style="text-align:center">${t.cat1 > 0 ? (t.cat1 / cnt).toFixed(0) : '-'}</td>
                    <td style="text-align:center">${t.cat2 > 0 ? (t.cat2 / cnt).toFixed(0) : '-'}</td>
                    <td style="text-align:center">${t.mid > 0 ? (t.mid / cnt).toFixed(0) : '-'}</td>
                    <td style="text-align:center">${t.end > 0 ? (t.end / cnt).toFixed(0) : '-'}</td>
                    <td style="text-align:center">${t.avg > 0 ? (t.avg / cnt).toFixed(0) : '-'}</td>
                    <td></td>
                </tr>
                <tr class="grade-totals" style="color: ${primaryColor}; background: #f1f5f9; border-top: 2px solid #e2e8f0;">
                    <td>RANK</td>
                    <td style="text-align:center">${data.rankings.cat1 ? data.rankings.cat1 + '/' + data.summary.class_size : '-'}</td>
                    <td style="text-align:center">${data.rankings.cat2 ? data.rankings.cat2 + '/' + data.summary.class_size : '-'}</td>
                    <td style="text-align:center">${data.rankings.midterm ? data.rankings.midterm + '/' + data.summary.class_size : '-'}</td>
                    <td style="text-align:center">${data.rankings.final_exam ? data.rankings.final_exam + '/' + data.summary.class_size : '-'}</td>
                    <td style="text-align:center">${data.rankings.average ? data.rankings.average + '/' + data.summary.class_size : '-'}</td>
                    <td></td>
                </tr>`
        })()}
        </tfoot>
    </table>

    <div class="remarks-group">
        <div class="remark-box">
            <div class="remark-title">Class Teacher's Remarks</div>
            <div class="remark-text">${data.summary.teacher_remarks || 'No remarks recorded.'}</div>
            
            <div style="margin-top: 15px;">
                <span class="info-lbl">Attendance: </span>
                <span class="info-val">${data.attendance.attendance_rate}%</span>
                <div class="attendance-track">
                    <div class="attendance-fill" style="width: ${data.attendance.attendance_rate}%"></div>
                </div>
            </div>
        </div>
        <div class="remark-box">
            <div class="remark-title">Principal's Remarks</div>
            <div class="remark-text">${data.summary.principal_remarks || 'Diligent work is noted.'}</div>
        </div>
    </div>

    ${chartItems.length > 0 ? `
    <div class="chart-section">
        <div class="chart-title">Subject Performance Overview</div>
        <div class="chart-grid">
            ${chartItems}
        </div>
    </div>` : ''}

    <div class="signatures">
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-lbl">Class Teacher</div>
        </div>
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-lbl">Principal</div>
        </div>
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-lbl">Parent / Guardian</div>
        </div>
    </div>

    ${nextTermDate ? `<div class="opening-date">Opening Date: ${new Date(nextTermDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>` : ''}
</body>
</html>`
}
