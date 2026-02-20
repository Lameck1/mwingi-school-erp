import { getDatabase } from '../database'
import { getImageAsBase64DataUrl } from './image-utils'

export interface SchoolInfo {
    name: string
    motto: string
    logoDataUrl: string | null
}

/**
 * Fetch school name, motto, and logo (as base64 data URL) for PDF embedding.
 */
export function getSchoolInfo(): SchoolInfo {
    const db = getDatabase()
    const row = db.prepare(
        'SELECT school_name, school_motto, logo_path FROM school_settings WHERE id = 1'
    ).get() as { school_name?: string; school_motto?: string; logo_path?: string } | undefined

    const logoDataUrl = row?.logo_path ? getImageAsBase64DataUrl(row.logo_path) : null

    return {
        name: row?.school_name || 'School',
        motto: row?.school_motto || '',
        logoDataUrl,
    }
}

/**
 * Build a reusable HTML header block for PDF reports with optional school logo.
 */
export function buildPdfHeader(schoolInfo: SchoolInfo, reportTitle?: string): { html: string; style: string } {
    const logoHtml = schoolInfo.logoDataUrl
        ? `<img src="${schoolInfo.logoDataUrl}" class="school-logo" alt="School Logo" />`
        : ''

    const mottoHtml = schoolInfo.motto
        ? `<div class="school-motto">${schoolInfo.motto}</div>`
        : ''

    const titleHtml = reportTitle
        ? `<div class="report-title">${reportTitle}</div>`
        : ''

    const html = `
    <div class="header">
      ${logoHtml}
      <div class="school-name">${schoolInfo.name}</div>
      ${mottoHtml}
      ${titleHtml}
    </div>
  `

    const style = `
    .header { text-align: center; margin-bottom: 10px; border-bottom: 3px double #1a5276; padding-bottom: 10px; }
    .school-logo { height: 60px; width: auto; margin-bottom: 4px; display: block; margin-left: auto; margin-right: auto; }
    .school-name { font-size: 22px; font-weight: bold; color: #1a5276; text-transform: uppercase; letter-spacing: 1px; }
    .school-motto { font-size: 10px; color: #666; margin-top: 2px; font-style: italic; }
    .report-title { font-size: 14px; font-weight: bold; margin-top: 6px; color: #2c3e50; text-transform: uppercase; background: #eaf2f8; padding: 4px 12px; display: inline-block; border-radius: 3px; }
  `

    return { html, style }
}
