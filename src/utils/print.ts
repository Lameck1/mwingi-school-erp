

interface PrintOptions {
  title: string
  template: 'receipt' | 'invoice' | 'statement' | 'report' | 'payslip'
  data: Record<string, unknown>
  schoolSettings?: Record<string, unknown>
  orientation?: 'portrait' | 'landscape'
}

export function printDocument(options: PrintOptions): void {
  const { title, template, data, schoolSettings, orientation = 'portrait' } = options

  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Please allow popups to print documents')
    return
  }

  const html = generatePrintHTML(template, data, schoolSettings, title, orientation)

  printWindow.document.write(html)
  printWindow.document.close()

  // Focus the new window so user can see the preview
  printWindow.focus()
}

function generatePrintHTML(
  template: string,
  data: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
  title: string,
  orientation: string
) {
  const schoolName = settings?.schoolName || 'Mwingi Adventist School'
  const schoolAddress = settings?.address || 'P.O Box 123, Mwingi'
  const schoolPhone = settings?.phone || '0700 000 000'
  const schoolEmail = settings?.email || 'info@mwingischool.ac.ke'

  const css = `
    @page { size: A4 ${orientation}; margin: 10mm; }
    body { font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.5; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
    .school-name { font-size: 24px; font-weight: bold; color: #0f172a; text-transform: uppercase; }
    .school-info { font-size: 11px; color: #64748b; }
    .doc-title { font-size: 18px; font-weight: bold; margin: 15px 0; text-align: center; text-transform: uppercase; }
    
    table { w-full; border-collapse: collapse; margin-bottom: 20px; width: 100%; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background-color: #f8fafc; font-weight: 600; text-transform: uppercase; font-size: 10px; }
    .total-row { font-weight: bold; background-color: #f1f5f9; }
    
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .meta-box { border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .meta-value { font-size: 12px; font-weight: 600; }
    
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
    .sig-line { border-top: 1px solid #000; width: 200px; padding-top: 5px; text-align: center; font-size: 11px; }

    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); 
                 font-size: 100px; opacity: 0.03; font-weight: bold; pointer-events: none; z-index: -1; }
  `

  let content = ''

  if (template === 'statement') {
    const ledger = data.ledger as any[] || []
    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Student Details</div>
          <div class="meta-value">${data.studentName}</div>
          <div>ADM: ${data.admissionNumber}</div>
          <div>Stream: ${data.streamName}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Statement Summary</div>
          <div class="meta-value">Date: ${new Date().toLocaleDateString()}</div>
          <div>Opening: ${(data.openingBalance as number || 0).toLocaleString()}</div>
          <div style="font-size: 14px; margin-top: 5px;">Closing: ${(data.closingBalance as number || 0).toLocaleString()}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Description</th>
            <th style="text-align: right">Debit</th>
            <th style="text-align: right">Credit</th>
            <th style="text-align: right">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${ledger.map((row: any) => `
            <tr>
              <td>${new Date(row.date).toLocaleDateString()}</td>
              <td>${row.ref || '-'}</td>
              <td>${row.description}</td>
              <td style="text-align: right">${row.debit > 0 ? (row.debit || 0).toLocaleString() : '-'}</td>
              <td style="text-align: right">${row.credit > 0 ? (row.credit || 0).toLocaleString() : '-'}</td>
              <td style="text-align: right">${(row.running_balance || 0).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="signatures">
        <div class="sig-line">School Accountant</div>
        <div class="sig-line">Parent/Guardian</div>
      </div>
    `
  } else if (template === 'receipt') {
    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Receipt For</div>
          <div class="meta-value">${data.studentName}</div>
          <div>ADM: ${data.admissionNumber}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Receipt Details</div>
          <div class="meta-value">No: ${data.receiptNumber}</div>
          <div>Date: ${new Date(data.date as string).toLocaleDateString()}</div>
          <div>Mode: ${data.paymentMode}</div>
        </div>
      </div>

      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <div style="font-size: 14px; text-align: center;">Amount Received</div>
        <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 10px 0;">
          KES ${(data.amount as number).toLocaleString()}
        </div>
        <div style="text-align: center; font-style: italic; color: #64748b;">
          ${data.amountInWords}
        </div>
      </div>

      <div class="signatures">
        <div class="sig-line">Authorized Signatory</div>
      </div>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          ${css}
          
          /* Print toolbar - hidden when printing */
          .print-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .print-toolbar-title {
            color: #fff;
            font-weight: bold;
            font-size: 14px;
          }
          .print-toolbar-buttons {
            display: flex;
            gap: 10px;
          }
          .btn-print {
            background: #22c55e;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            font-size: 14px;
          }
          .btn-print:hover { background: #16a34a; }
          .btn-close {
            background: #64748b;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            font-size: 14px;
          }
          .btn-close:hover { background: #475569; }
          
          .print-content {
            margin-top: 70px;
            padding: 20px;
          }
          
          @media print {
            .print-toolbar { display: none !important; }
            .print-content { margin-top: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="print-toolbar">
          <span class="print-toolbar-title">📄 ${title} - Print Preview</span>
          <div class="print-toolbar-buttons">
            <button class="btn-print" onclick="window.print()">🖨️ Print Document</button>
            <button class="btn-close" onclick="window.close()">✕ Close</button>
          </div>
        </div>
        
        <div class="print-content">
          <div class="watermark">${schoolName}</div>
          
          <div class="header">
            <div class="school-name">${schoolName}</div>
            <div class="school-info">
              ${schoolAddress} | ${schoolPhone} | ${schoolEmail}
            </div>
          </div>

          <div class="doc-title">${title}</div>
          
          ${content}

          <div class="footer">
            Generated on ${new Date().toLocaleString()} by School ERP System
          </div>
        </div>
      </body>
    </html>
  `
}
