import { formatCurrency } from './format';

interface PrintOptions {
    title: string;
    template: 'receipt' | 'payslip' | 'statement';
    data: any;
    schoolSettings: any;
}

export function printDocument({ title, template, data, schoolSettings }: PrintOptions) {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        alert('Please allow pop-ups to print documents');
        return;
    }

    const styles = `
    <style>
      body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e40af; padding-bottom: 15px; position: relative; }
      .header h1 { margin: 0; color: #1e3a8a; font-size: 24px; text-transform: uppercase; }
      .header p { margin: 3px 0; font-size: 14px; color: #4b5563; }
      
      .doc-type { position: absolute; top: 0; right: 0; background: #1e40af; color: white; padding: 5px 15px; font-size: 12px; font-weight: bold; border-radius: 4px; }
      
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
      .info-box { border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; }
      .label { color: #6b7280; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 4px; }
      .value { font-weight: 600; font-size: 14px; color: #111827; }

      .main-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      .main-table th { text-align: left; background: #f9fafb; color: #374151; font-weight: 600; font-size: 12px; padding: 10px; border-bottom: 2px solid #e5e7eb; }
      .main-table td { padding: 12px 10px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
      .main-table .amount { text-align: right; font-family: monospace; font-size: 15px; }

      .summary-box { margin-left: auto; width: 300px; background: #f3f4f6; padding: 15px; border-radius: 8px; }
      .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
      .summary-row.total { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 8px; font-weight: bold; font-size: 18px; color: #1e3a8a; }

      .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 20px; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; margin-top: 40px; }
      .sig-line { border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 12px; }

      @media print {
        @page { margin: 15mm; }
        body { padding: 0; }
        .no-print { display: none; }
      }
    </style>
  `;

    let content = '';

    if (template === 'receipt') {
        content = renderReceipt(data, schoolSettings);
    } else if (template === 'payslip') {
        content = renderPayslip(data, schoolSettings);
    } else if (template === 'statement') {
        content = renderStatement(data, schoolSettings);
    }

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        ${styles}
      </head>
      <body>
        ${content}
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
              // window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `);
    printWindow.document.close();
}

function renderReceipt(data: any, school: any) {
    return `
    <div class="header">
      <div class="doc-type">OFFICIAL RECEIPT</div>
      <h1>${school?.school_name || 'MWINGI ADVENTIST SCHOOL'}</h1>
      <p>${school?.school_address || 'P.O BOX 123, MWINGI'}</p>
      <p>Tel: ${school?.school_phone || 'N/A'} | Email: ${school?.school_email || 'N/A'}</p>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="label">Received From</div>
        <div class="value">${data.studentName}</div>
        <div class="label" style="margin-top:10px">Admission Number</div>
        <div class="value">${data.admissionNumber}</div>
      </div>
      <div class="info-box">
        <div class="label">Receipt Number</div>
        <div class="value">${data.receiptNumber}</div>
        <div class="label" style="margin-top:10px">Date</div>
        <div class="value">${new Date(data.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      </div>
    </div>

    <table class="main-table">
      <thead>
        <tr>
          <th>DESCRIPTION</th>
          <th>PAYMENT METHOD</th>
          <th>REFERENCE</th>
          <th class="amount">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${data.description || 'School Fees Payment'}</td>
          <td>${data.paymentMethod}</td>
          <td>${data.reference || '-'}</td>
          <td class="amount">${formatCurrency(data.amount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row total">
        <span>TOTAL PAID</span>
        <span>${formatCurrency(data.amount)}</span>
      </div>
      <div class="summary-row" style="margin-top:10px">
        <span>Balance Due</span>
        <span style="color:#dc2626">${formatCurrency(data.balance || 0)}</span>
      </div>
    </div>

    <div class="signatures">
      <div class="sig-line">School Accountant / Bursar</div>
      <div class="sig-line">Parent / Guardian Signature</div>
    </div>

    <div class="footer">
      <p>Printed on ${new Date().toLocaleString()}</p>
      <p>Thank you for your support. Knowledge for Service.</p>
    </div>
  `;
}

function renderPayslip(data: any, school: any) {
    return `
    <div class="header">
      <div class="doc-type">PAYSLIP</div>
      <h1>${school?.school_name || 'MWINGI ADVENTIST SCHOOL'}</h1>
      <p>${school?.school_address || 'P.O BOX 123, MWINGI'}</p>
      <p>Month: ${data.periodName}</p>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="label">Employee Name</div>
        <div class="value">${data.staffName}</div>
        <div class="label" style="margin-top:10px">Department</div>
        <div class="value">${data.department || '-'}</div>
      </div>
      <div class="info-box">
        <div class="label">Employee Number</div>
        <div class="value">${data.staffNumber}</div>
        <div class="label" style="margin-top:10px">Job Title</div>
        <div class="value">${data.jobTitle || '-'}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
      <div>
        <h3 style="font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px;">Earnings</h3>
        <table class="main-table">
          <tr><td>Basic Salary</td><td class="amount">${formatCurrency(data.basicSalary)}</td></tr>
          ${(data.allowancesList || []).map((a: any) => `<tr><td>${a.allowance_name}</td><td class="amount">${formatCurrency(a.amount)}</td></tr>`).join('')}
          <tr style="font-weight: bold;"><td>GROSS SALARY</td><td class="amount">${formatCurrency(data.grossSalary)}</td></tr>
        </table>
      </div>
      <div>
        <h3 style="font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px;">Deductions</h3>
        <table class="main-table">
          <tr><td>PAYE (Tax)</td><td class="amount">${formatCurrency(data.paye || 0)}</td></tr>
          <tr><td>NHIF</td><td class="amount">${formatCurrency(data.nhif || 0)}</td></tr>
          <tr><td>NSSF</td><td class="amount">${formatCurrency(data.nssf || 0)}</td></tr>
          ${(data.deductionsList || []).map((d: any) => `<tr><td>${d.deduction_name}</td><td class="amount">${formatCurrency(d.amount)}</td></tr>`).join('')}
          <tr style="font-weight: bold;"><td>TOTAL DEDUCTIONS</td><td class="amount">${formatCurrency(data.totalDeductions)}</td></tr>
        </table>
      </div>
    </div>

    <div class="summary-box" style="width: 100%; border: 2px solid #1e3a8a;">
      <div class="summary-row total">
        <span>NET PAY</span>
        <span>${formatCurrency(data.netSalary)}</span>
      </div>
    </div>

    <div class="footer">
      <p>This is a computer generated payslip and does not require a signature.</p>
      <p>KRA PIN: ${data.kraPin || school?.kra_pin || 'N/A'}</p>
    </div>
  `;
}

function renderStatement(data: any, school: any) {
    return `
    <div class="header">
      <div class="doc-type">FEE STATEMENT</div>
      <h1>${school?.school_name || 'MWINGI ADVENTIST SCHOOL'}</h1>
      <p>${school?.school_address || 'P.O BOX 123, MWINGI'}</p>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="label">Student Name</div>
        <div class="value">${data.studentName}</div>
        <div class="label" style="margin-top:10px">Admission Number</div>
        <div class="value">${data.admissionNumber}</div>
      </div>
      <div class="info-box">
        <div class="label">Current Class</div>
        <div class="value">${data.streamName || '-'}</div>
        <div class="label" style="margin-top:10px">Period</div>
        <div class="value">As of ${new Date().toLocaleDateString()}</div>
      </div>
    </div>

    <table class="main-table">
      <thead>
        <tr>
          <th>DATE</th>
          <th>DESCRIPTION</th>
          <th class="amount">DEBIT</th>
          <th class="amount">CREDIT</th>
          <th class="amount">BALANCE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>-</td>
          <td><b>Opening Balance</b></td>
          <td class="amount">-</td>
          <td class="amount">-</td>
          <td class="amount">${formatCurrency(data.openingBalance || 0)}</td>
        </tr>
        ${(data.ledger || []).map((tx: any) => `
          <tr>
            <td>${new Date(tx.transaction_date).toLocaleDateString()}</td>
            <td>
              ${tx.description || tx.transaction_type}
              ${tx.receipt_number ? `<br/><small style="color:#666">Receipt: ${tx.receipt_number}</small>` : ''}
              ${tx.invoice_number ? `<br/><small style="color:#666">Invoice: ${tx.invoice_number}</small>` : ''}
            </td>
            <td class="amount">${tx.debit_credit === 'DEBIT' ? formatCurrency(tx.amount) : '-'}</td>
            <td class="amount">${tx.debit_credit === 'CREDIT' ? formatCurrency(tx.amount) : '-'}</td>
            <td class="amount" style="font-weight:500">${formatCurrency(tx.runningBalance)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row total">
        <span>CLOSING BALANCE</span>
        <span>${formatCurrency(data.closingBalance)}</span>
      </div>
    </div>

    <div class="footer">
      <p>End of Statement</p>
      <p>MWINGI ADVENTIST SCHOOL - Quality Education & Character</p>
    </div>
  `;
}
