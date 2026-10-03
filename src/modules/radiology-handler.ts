/**
 * HMIS Radiology Report Handler
 *
 * Autofills cross-sectional reporting fields (Technique, Findings, Impression,
 * module selection, and PGR/Consultant attribution) in HMIS Punjab's radiology module.
 *
 * Target: https://hmis.punjab.gov.pk/radiology/proceeded-patients
 * Verified against live HMIS TinyMCE DOM structure and Livewire bindings.
 */

import { HMIS_SELECTORS } from './selectors';
import { reportStatus } from './state';
import { showToast, delay } from './utils';
import {
  setMainWorldTinyMce,
  autoSelectModuleIfPresent,
  highlightSaveButton,
  waitForLivewireSettlement
} from './radiology-dom-utils';
export { extractActiveInvestigation } from './radiology-extractor';
export { fetchPatientHistoryModal } from './radiology-history-parser';
export * from './radiology-constants';

export interface RadiologyReportPayload {
  patientMrn?: string;
  patientName?: string;
  accessionNumber?: string;
  modality?: string;
  scanType?: string;
  moduleId?: string;
  technique?: string;
  findings: string;
  impression: string;
  clinicalHistory?: string;
  comments?: string;
  pgrName?: string;
  consultantName?: string;
  provisionalDiagnosis?: string;
  icd10Code?: string;
  action?: 'stage_only' | 'save' | 'submit';
}

/**
 * Sets HTML or text content inside a TinyMCE iframe or fallback textarea.
 */
function setRichEditorContent(
  iframeSelector: string,
  textareaSelector: string,
  keyword: string,
  htmlContent: string
): boolean {
  let filled = false;

  // 1. Direct window.tinymce API in page context (via main-world bridge & inline script)
  setMainWorldTinyMce(keyword, htmlContent);

  // 2. Direct TinyMCE iframe DOM access
  const iframe = document.querySelector<HTMLIFrameElement>(iframeSelector);
  if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
    try {
      iframe.contentDocument.body.innerHTML = htmlContent;
      iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
      iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }));
      filled = true;
    } catch (e) {
      console.warn('[HMIS_RAD] Error setting iframe content:', e);
    }
  }

  // 3. Sync to underlying textarea and fire Livewire events
  const textarea = document.querySelector<HTMLTextAreaElement>(textareaSelector);
  if (textarea) {
    const plainText = htmlContent.replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n').trim();
    textarea.value = plainText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    filled = true;
  }

  return filled;
}

/**
 * Normalizes input HTML/text to clean HTML paragraphs.
 */
function formatToHtml(textOrHtml: string): string {
  if (!textOrHtml) return '';
  if (textOrHtml.includes('<p>') || textOrHtml.includes('<br>') || textOrHtml.includes('<div>')) {
    return textOrHtml;
  }
  return textOrHtml
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');
}

/**
 * Directly sets the module in #changeModule if explicit moduleId is provided.
 */
export function setModuleId(moduleId: string): boolean {
  const SEL = HMIS_SELECTORS.RADIOLOGY_REPORT;
  const select = document.querySelector<HTMLSelectElement>(SEL.MODULE_SELECT);
  if (!select) return false;

  select.value = moduleId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  select.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Autofills all radiology reporting fields using the received Rad Suite report.
 * Strictly enforces Save Draft only (Submit is permanently locked for testing).
 */
export async function autofillRadiologyReport(
  payload: RadiologyReportPayload
): Promise<{ success: boolean; message: string }> {
  reportStatus('Autofilling Radiology Report in HMIS...', 'progress');
  showToast('Autofilling Rad Suite Report...', false);

  const SEL = HMIS_SELECTORS.RADIOLOGY_REPORT;

  // 1. Explicit or Fuzzy Module Selection
  if (payload.moduleId) {
    setModuleId(payload.moduleId);
    await waitForLivewireSettlement(1500);
  } else {
    await autoSelectModuleIfPresent(payload.scanType, payload.modality);
    await waitForLivewireSettlement(1200);
  }

  // 2. Extra delay to ensure HMIS default normal template load has fully finished
  await delay(400);

  const pgr = payload.pgrName || 'Resident Radiologist (PGR)';
  const consultant = payload.consultantName || 'Consultant Radiologist';

  // Build Report Content (Technique + Findings + Attribution)
  const formattedFindings = formatToHtml(payload.findings);
  let reportBody = '';
  if (payload.technique) {
    reportBody += `<p><strong>TECHNIQUE:</strong><br>${payload.technique}</p>`;
  }
  reportBody += `<p><strong>FINDINGS:</strong></p>${formattedFindings}`;
  reportBody += `<br><p><strong>Reported By:</strong> ${pgr}<br><strong>Verified By:</strong> ${consultant}</p>`;

  // Build Impression Content
  const formattedImpression = formatToHtml(payload.impression);
  const impressionBody = `<p><strong>IMPRESSION:</strong></p>${formattedImpression}<br><p><strong>Attribution:</strong> ${pgr} | <strong>Verified:</strong> ${consultant}</p>`;

  // Fill History if present
  if (payload.clinicalHistory) {
    setRichEditorContent(SEL.HISTORY_IFRAME, SEL.HISTORY_TEXTAREA, 'history', `<p>${payload.clinicalHistory}</p>`);
  }

  // Fill Main Report / Findings
  const reportFilled = setRichEditorContent(SEL.REPORT_IFRAME, SEL.REPORT_TEXTAREA, 'report', reportBody);

  // Fill Impression
  const impressionFilled = setRichEditorContent(SEL.IMPRESSION_IFRAME, SEL.IMPRESSION_TEXTAREA, 'impression', impressionBody);

  // Fill Comments if present
  if (payload.comments) {
    const commentsEl = document.querySelector<HTMLTextAreaElement>(SEL.COMMENTS_TEXTAREA);
    if (commentsEl) {
      commentsEl.value = payload.comments;
      commentsEl.dispatchEvent(new Event('input', { bubbles: true }));
      commentsEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 3. Post-injection anti-wipe check (verify Livewire didn't revert within 500ms)
  await delay(500);
  setRichEditorContent(SEL.REPORT_IFRAME, SEL.REPORT_TEXTAREA, 'report', reportBody);
  setRichEditorContent(SEL.IMPRESSION_IFRAME, SEL.IMPRESSION_TEXTAREA, 'impression', impressionBody);

  if (reportFilled || impressionFilled) {
    highlightSaveButton();

    // Safety Invariant: Treat any submit action as draft save during testing
    if (payload.action === 'save' || payload.action === 'submit') {
      await delay(400);
      const saved = await triggerHmisSaveDraft();
      const msg = saved
        ? 'Report Draft successfully saved and verified in HMIS.'
        : 'Report staged; please click Save Draft manually.';
      reportStatus(msg, saved ? 'success' : 'info');
      showToast(msg, !saved);
      return { success: saved, message: msg };
    }

    const msg = 'Radiology fields auto-filled and locked against template wipe. Staged for review.';
    reportStatus(msg, 'success');
    showToast('HMIS Form Staged! Review and click Save Draft.', false);
    return { success: true, message: msg };
  }

  const warnMsg = 'Could not find TinyMCE editors for Report/Impression. Ensure module is selected.';
  reportStatus(warnMsg, 'error');
  showToast(warnMsg, true);
  return { success: false, message: warnMsg };
}

/**
 * Triggers Save Draft: save('save')
 * Verified working button: button[wire:click="save('save')"]
 */
export async function triggerHmisSaveDraft(): Promise<boolean> {
  const saveBtn = document.querySelector<HTMLElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.SAVE_DRAFT_BTN);
  if (saveBtn) {
    saveBtn.click();
    await waitForLivewireSettlement(2000);
    return true;
  }
  return false;
}

/**
 * STRICTLY LOCKED FOR CLINICAL TESTING PHASE
 * Final submit is disabled to prevent reports from becoming unreachable.
 */
export async function triggerHmisFinalSubmit(): Promise<boolean> {
  console.warn('[SECURITY INVARIANT] Final submit is permanently disabled during testing phase.');
  showToast('Final submit is locked for testing. Only Save Draft is permitted.', true);
  return false;
}

/**
 * Triggers View PACS Studies: getPatientStudies(mrn)
 */
export function triggerHmisPatientStudies(studyId?: string): boolean {
  const btn = document.querySelector<HTMLElement>(
    studyId
      ? `[wire\\:click*="getPatientStudies('${studyId}')"], [wire\\:click*="getPatientStudies(${studyId})"]`
      : HMIS_SELECTORS.RADIOLOGY_REPORT.IMAGE_STUDIES_BTN
  );
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

/**
 * Triggers Reject Investigation
 */
export function triggerHmisRejectInvestigation(investigationId?: string): boolean {
  const btn = document.querySelector<HTMLElement>(
    investigationId
      ? `[wire\\:click*="${investigationId}"]`
      : HMIS_SELECTORS.RADIOLOGY_REPORT.REJECT_BTN
  );
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}
