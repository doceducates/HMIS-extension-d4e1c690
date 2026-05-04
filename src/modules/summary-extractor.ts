/**
 * Summary Extractor — Extracts diagnosis and investigation data from the
 * HMIS patient encounter Summary tab.
 *
 * HMIS DOM Structure (verified 2026-05-04 live inspection):
 *   - Sections are `.col-md-6` divs
 *   - Section title is the FIRST TEXT NODE of the div (plain text, no tag)
 *   - Items are newline-separated text inside the div (NOT in <p> or <li>)
 *   - Diagnosis items: "Provisional\n<name>" or "Final\n<name>"
 *   - Investigation items have long numeric CPT codes appended directly:
 *       "USG Swelling001000000000076999"
 *       "Histopathology Biopsy001000000000T88307"
 *   - Section names: "Diagnosis", "Radiology", "Pathology", "Investigation"
 */

import { reportStatus } from './state';

export interface ExtractedSummaryData {
    diagnoses: string[];
    investigations: string[];
}

/**
 * Extracts Diagnosis and Radiology/Pathology/Investigation data from the summary page.
 *
 * Uses a 3-strategy approach:
 *   1. col-md-6 innerText parsing (primary — matches HMIS live DOM)
 *   2. Header element scan (fallback for older HMIS versions)
 *   3. Full page text scan (last resort)
 *
 * Returns whatever was found — may be empty.
 * The clinical-rules engine handles the "what to do when empty" logic.
 */
export async function extractDataFromSummary(): Promise<ExtractedSummaryData> {
    const data: ExtractedSummaryData = {
        diagnoses: [],
        investigations: []
    };

    // Strategy 1: Read .col-md-6 containers by their first text node (primary)
    const strategy1Found = extractFromColMd6(data);

    // Strategy 2: Header element scan fallback
    if (!strategy1Found) {
        reportStatus('col-md-6 scan found nothing — trying header element scan', 'info');
        extractFromHeaderElements(data);
    }

    // Strategy 3: If still nothing, try full-page text scan
    if (data.diagnoses.length === 0 && data.investigations.length === 0) {
        reportStatus('Header scan found nothing — trying full page scan', 'info');
        extractFromFullPageText(data);
    }

    // Deduplicate
    data.diagnoses = [...new Set(data.diagnoses)];
    data.investigations = [...new Set(data.investigations)];

    reportStatus(
        `Extracted: ${data.diagnoses.length} diagnosis(es), ${data.investigations.length} investigation(s)`,
        'info'
    );

    if (data.diagnoses.length > 0) {
        reportStatus(`Diagnoses: ${data.diagnoses.join(' | ')}`, 'info');
    }
    if (data.investigations.length > 0) {
        reportStatus(`Investigations: ${data.investigations.join(' | ')}`, 'info');
    }

    return data;
}

// ════════════════════════════════════════════════════════════════
//  STRATEGY 1: col-md-6 innerText parsing (matches live HMIS DOM)
// ════════════════════════════════════════════════════════════════

/**
 * Reads each .col-md-6 div's innerText.
 * The first non-empty line is treated as the section title.
 * Subsequent lines are the items.
 * Returns true if at least one section matched.
 */
function extractFromColMd6(data: ExtractedSummaryData): boolean {
    const cols = document.querySelectorAll('.col-md-6, .col-md-12');
    let matched = false;

    cols.forEach(col => {
        const el = col as HTMLElement;
        const rawText = el.innerText || '';
        const lines = rawText
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        if (lines.length === 0) return;

        // Find the section type by scanning ALL lines for a section header
        // (not just lines[0]) because <strong> tags may render before innerText
        let sectionType: 'diagnosis' | 'investigation' | null = null;
        let headerLineIdx = -1;

        for (let i = 0; i < Math.min(lines.length, 3); i++) {
            const lower = lines[i].toLowerCase().trim();
            if (lower === 'diagnosis' || lower === 'diagnoses') {
                sectionType = 'diagnosis';
                headerLineIdx = i;
                break;
            } else if (
                lower === 'radiology' || lower === 'radiology:' ||
                lower === 'pathology' || lower === 'pathology:' ||
                lower === 'investigation' || lower === 'investigations' ||
                lower === 'procedure' || lower === 'orders'
            ) {
                sectionType = 'investigation';
                headerLineIdx = i;
                break;
            }
        }

        if (!sectionType) return;

        const contentLines = lines.slice(headerLineIdx + 1);

        if (sectionType === 'diagnosis') {
            matched = true;
            parseDiagnosisLines(contentLines, data);
        } else {
            matched = true;
            parseInvestigationLines(contentLines, data);
        }
    });

    return matched;
}

// ════════════════════════════════════════════════════════════════
//  STRATEGY 2: Header element scan
// ════════════════════════════════════════════════════════════════

/**
 * Looks for h4/h5/h6/strong elements whose text mentions a section name,
 * then extracts sibling/parent text.
 */
function extractFromHeaderElements(data: ExtractedSummaryData): void {
    const allHeaders = document.querySelectorAll('h4, h5, h6, .card-header, .section-title, strong, b');

    allHeaders.forEach(h => {
        const hText = h.textContent?.trim().toLowerCase() || '';
        const parent = h.closest('.col-md-6') || h.closest('.card') || h.parentElement;
        if (!parent) return;

        if (hText === 'diagnosis' || hText === 'diagnoses') {
            const el = parent as HTMLElement;
            const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(1);
            parseDiagnosisLines(lines, data);
        } else if (
            hText === 'radiology' ||
            hText === 'pathology' ||
            hText === 'investigation' ||
            hText === 'investigations' ||
            hText === 'procedure' ||
            hText === 'orders'
        ) {
            const el = parent as HTMLElement;
            const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(1);
            parseInvestigationLines(lines, data);
        }
    });
}

// ════════════════════════════════════════════════════════════════
//  STRATEGY 3: Full-page text scan
// ════════════════════════════════════════════════════════════════

/**
 * Last resort: scan the entire right_col or body text for known section
 * markers and extract lines after them.
 */
function extractFromFullPageText(data: ExtractedSummaryData): void {
    const container =
        document.querySelector('.right_col') ||
        document.querySelector('#content') ||
        document.querySelector('main') ||
        document.body;

    const el = container as HTMLElement;
    const allLines = (el.innerText || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    let mode: 'diagnosis' | 'investigation' | null = null;

    for (const line of allLines) {
        const lower = line.toLowerCase();

        // Section title detection
        if (lower === 'diagnosis' || lower === 'diagnoses') {
            mode = 'diagnosis';
            continue;
        }
        if (
            lower === 'radiology' ||
            lower === 'pathology' ||
            lower === 'investigation' ||
            lower === 'investigations'
        ) {
            mode = 'investigation';
            continue;
        }
        // Reset mode on other section headers
        if (isKnownSectionHeader(lower)) {
            mode = null;
            continue;
        }

        if (mode === 'diagnosis') {
            const cleaned = cleanDiagnosisText(line);
            if (isValidExtractedText(cleaned)) {
                data.diagnoses.push(cleaned);
            }
        } else if (mode === 'investigation') {
            const cleaned = cleanInvestigationText(line);
            if (isValidExtractedText(cleaned)) {
                data.investigations.push(cleaned);
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  LINE PARSERS
// ════════════════════════════════════════════════════════════════

/**
 * Parse diagnosis lines from a section.
 *
 * HMIS format (verified 2026-05-04):
 *   Line 1: "Provisional"  ← type label
 *   Line 2: "Localized swelling, mass and lump, unspecified"  ← actual diagnosis
 *   Line 3: "Provisional"  ← next entry type label
 *   Line 4: "Benign neoplasm of left breast"  ← actual diagnosis
 *
 * State-machine: a type-label line signals that the NEXT line is a diagnosis name.
 * Lines that appear without a preceding type-label are also extracted (fallback).
 */
function parseDiagnosisLines(lines: string[], data: ExtractedSummaryData): void {
    const typeLabels = new Set(['provisional', 'final', 'confirmed', 'suspected']);
    const noiseLines = new Set(['no result found', 'view more', 'no results found']);

    let expectDiagnosis = false;

    for (const line of lines) {
        const lower = line.toLowerCase().trim();

        if (noiseLines.has(lower)) {
            expectDiagnosis = false;
            continue;
        }

        if (typeLabels.has(lower)) {
            // This line is a type label — next line should be the diagnosis name
            expectDiagnosis = true;
            continue;
        }

        if (expectDiagnosis || !typeLabels.has(lower)) {
            const cleaned = cleanDiagnosisText(line);
            if (isValidExtractedText(cleaned) && !isHeaderText(cleaned)) {
                data.diagnoses.push(cleaned);
            }
            expectDiagnosis = false;
        }
    }
}

/**
 * Parse investigation lines from a section (Radiology / Pathology).
 * HMIS format: items may have CPT codes appended directly to text.
 * Pipe-separated specimen info (| SERUM, | Histo Biopsy) is also stripped.
 */
function parseInvestigationLines(lines: string[], data: ExtractedSummaryData): void {
    const noise = new Set(['no result found', 'view more']);

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (noise.has(lower)) continue;
        // Skip lines that are just pipe-separated specimen info (e.g. "| Histo Biopsy")
        if (line.startsWith('|')) continue;

        const cleaned = cleanInvestigationText(line);
        if (isValidExtractedText(cleaned) && !isHeaderText(cleaned)) {
            data.investigations.push(cleaned);
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  TEXT CLEANING
// ════════════════════════════════════════════════════════════════

/**
 * Clean raw diagnosis text from the summary page.
 * Strips "Provisional - " or "Final - " prefixes and other noise.
 */
function cleanDiagnosisText(raw: string): string {
    return raw
        .trim()
        // Remove "Provisional - " / "Final - " prefix
        .replace(/^(Provisional|Final|Confirmed|Suspected)\s*[-–—:]?\s*/i, '')
        // Remove trailing numbers/codes (with or without leading space)
        .replace(/\)?\d{6,18}\s*$/, '')
        // Remove "View More" button text that may leak in
        .replace(/View More/gi, '')
        // Remove pipe-separated specimen text
        .replace(/\|\s*.*/g, '')
        // Remove leading/trailing whitespace and dots/checkmarks
        .replace(/^[.·✓✔\s]+|[.·\s]+$/g, '')
        .trim();
}

/**
 * Clean raw investigation/procedure text from the summary page.
 * Strips trailing CPT codes (long numeric or alphanumeric suffixes) that HMIS appends.
 *
 * HMIS appends digits DIRECTLY to text with NO whitespace separator:
 *   "USG FNAC (Fine Needle Aspiration Cytology)00100000000010005"
 *   "Histopathology Biopsy001000000000T88307"
 */
function cleanInvestigationText(raw: string): string {
    return raw
        .trim()
        // Strip pipe-separated specimen info first (| Histo Biopsy, | SERUM, | EDTA...)
        .replace(/\|\s*.*/g, '')
        // Strip trailing 10-18 digit CPT codes (handles NO space before digits or alphanumeric suffix)
        .replace(/\)?[\dA-Z]{10,18}\s*$/, '')
        // Strip trailing 5-6 digit CPT codes with separator (e.g., "USG Abdomen - 76700")
        .replace(/\s*[-–]\s*\d{4,6}\s*$/, '')
        // Remove "View More" button text that may leak in
        .replace(/View More/gi, '')
        // Remove leading/trailing whitespace, dots, checkmarks
        .replace(/^[.·✓✔\s]+|[.·\s]+$/g, '')
        .trim();
}

// ════════════════════════════════════════════════════════════════
//  VALIDATION HELPERS
// ════════════════════════════════════════════════════════════════

function isValidExtractedText(text: string): boolean {
    if (!text || text.length <= 2) return false;

    const noise = [
        'n/a', 'none', 'nil', '--', '-', 'no', 'na',
        'provisional', 'final', 'confirmed', 'suspected',
        'no result found', 'no results found',
        'view more',
    ];
    if (noise.includes(text.toLowerCase())) return false;

    // Filter out pure number strings (residual CPT codes)
    if (/^\d+$/.test(text)) return false;

    return true;
}

function isHeaderText(text: string): boolean {
    const headers = [
        'radiology', 'investigation', 'investigations', 'procedure', 'order', 'orders',
        'diagnosis', 'diagnoses', 'pathology',
        'medication', 'vitals', 'allergies', 'immunization',
        'presenting complaints', 'complaints', 'patient summary'
    ];
    const lower = text.toLowerCase();
    return headers.some(h =>
        lower === h || lower === h + ':' || lower === h + 's' || lower === h + 's:'
    );
}

function isKnownSectionHeader(lower: string): boolean {
    const sections = [
        'vitals', 'presenting complaints', 'complaints',
        'allergies', 'immunization', 'medication',
        'pathology', 'radiology', 'investigation', 'investigations',
        'diagnosis', 'diagnoses', 'patient summary'
    ];
    return sections.some(s => lower === s || lower === s + ':');
}
