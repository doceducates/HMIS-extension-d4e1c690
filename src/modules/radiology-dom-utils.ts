/**
 * HMIS Radiology DOM Helper Utilities
 */

import { HMIS_SELECTORS } from './selectors';
import { reportStatus } from './state';
import { delay } from './utils';

/**
 * Normalizes anatomical and modality keywords for robust fuzzy matching.
 */
function normalizeScanTerm(str: string): string {
    return str
        .toUpperCase()
        .replace(/LUMBOSACRAL|LUMBAR/g, 'LS')
        .replace(/DORSAL/g, 'THORACIC')
        .replace(/HEAD/g, 'BRAIN')
        .replace(/C-SPINE/g, 'CERVICAL SPINE')
        .replace(/L-SPINE/g, 'LS SPINE')
        .replace(/T-SPINE/g, 'THORACIC SPINE')
        .replace(/[-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Executes a script in the page's MAIN world to set TinyMCE content directly.
 * Employs CustomEvent communication with main-world-bridge first, then fallback to script tag.
 */
export function setMainWorldTinyMce(fieldKeyword: string, content: string) {
    try {
        // Method 1: Dispatch to main-world-bridge (MV3 CSP-compliant)
        const payload: Record<string, string> = {};
        if (fieldKeyword.includes('report')) payload.findings = content;
        else if (fieldKeyword.includes('impression')) payload.impression = content;
        else if (fieldKeyword.includes('history')) payload.clinicalHistory = content;

        window.dispatchEvent(new CustomEvent('RAD_SUITE_SET_REPORT', { detail: payload }));
    } catch (e) {
        console.warn('[HMIS_RAD] Error dispatching to main-world bridge:', e);
    }

    // Method 2: Inline script injection fallback
    try {
        const script = document.createElement('script');
        script.textContent = `
            try {
                if (typeof window.tinymce !== 'undefined' && window.tinymce.editors) {
                    const ed = window.tinymce.editors.find(e => e.id && e.id.toLowerCase().includes('${fieldKeyword}'));
                    if (ed) {
                        ed.setContent(${JSON.stringify(content)});
                        ed.save();
                    }
                }
            } catch (e) {
                console.warn('[RAD_SUITE_MAIN_TINYMCE_ERR]', e);
            }
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (err) {
        console.warn('[HMIS_RAD] Error injecting main world script:', err);
    }
}

/**
 * Waits for Livewire AJAX network calls and loading bars to settle.
 */
export async function waitForLivewireSettlement(timeoutMs: number = 2500): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const loadingBar = document.querySelector('#wireLoadingBar, [wire\\:loading]');
        const isVisible = loadingBar && (loadingBar as HTMLElement).offsetParent !== null;
        if (!isVisible) {
            // Give 250ms quiet window after loading bar disappears
            await delay(250);
            return;
        }
        await delay(100);
    }
}

/**
 * Automatically selects the matching procedure module in #changeModule if not yet chosen.
 * Employs a 3-pass matcher (exact/substring, synonym normalized, anatomical token).
 */
export async function autoSelectModuleIfPresent(scanType?: string, modality?: string): Promise<boolean> {
    const SEL = HMIS_SELECTORS.RADIOLOGY_REPORT;
    const moduleSelect = document.querySelector<HTMLSelectElement>(SEL.MODULE_SELECT);
    if (!moduleSelect || !moduleSelect.options) return false;

    // If already selected by doctor, do not override
    if (moduleSelect.value && moduleSelect.value !== '') return true;

    const rawSearch = (scanType || modality || '').toUpperCase().trim();
    if (!rawSearch) return false;
    const normalizedSearch = normalizeScanTerm(rawSearch);

    let matchedOption: HTMLOptionElement | null = null;
    const validOptions = Array.from(moduleSelect.options).filter((o) => o.value);

    // Pass 1: Raw substring match (e.g. "HRCT CHEST", "MRI BRAIN")
    for (const opt of validOptions) {
        const optText = opt.text.toUpperCase();
        if (rawSearch.includes(optText) || optText.includes(rawSearch)) {
            matchedOption = opt;
            break;
        }
    }

    // Pass 2: Normalized synonym match (e.g. Lumbar -> LS Spine, Dorsal -> Thoracic)
    if (!matchedOption) {
        for (const opt of validOptions) {
            const normOpt = normalizeScanTerm(opt.text);
            if (normalizedSearch.includes(normOpt) || normOpt.includes(normalizedSearch)) {
                matchedOption = opt;
                break;
            }
        }
    }

    // Pass 3: Anatomical keyword match (e.g. "BRAIN", "KNEE", "SHOULDER", "PNS", "MRCP")
    if (!matchedOption) {
        const tokens = normalizedSearch
            .split(' ')
            .filter((w) => w.length > 2 && !['MRI', 'SCAN', 'PLAIN', 'CONTRAST', 'WITH'].includes(w));
        for (const opt of validOptions) {
            const normOpt = normalizeScanTerm(opt.text);
            if (tokens.some((token) => normOpt.includes(token))) {
                matchedOption = opt;
                break;
            }
        }
    }

    if (matchedOption) {
        moduleSelect.value = matchedOption.value;
        moduleSelect.dispatchEvent(new Event('change', { bubbles: true }));
        moduleSelect.dispatchEvent(new Event('input', { bubbles: true }));
        reportStatus(`Selected module: ${matchedOption.text}`, 'info');
        await delay(1200);
        return true;
    }

    return false;
}

/**
 * Highlights the Save Draft button to guide the doctor.
 */
export function highlightSaveButton() {
    const saveBtn = document.querySelector<HTMLButtonElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.SAVE_DRAFT_BTN);
    if (saveBtn) {
        saveBtn.style.boxShadow = '0 0 12px #06b6d4';
        saveBtn.style.border = '2px solid #0891b2';
    }
}
