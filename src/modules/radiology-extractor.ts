/**
 * HMIS Active Radiology Investigation Extractor
 * Extracts patient demographics, investigation IDs, module selection,
 * and current text from the active modal or page.
 */

import { HMIS_SELECTORS } from './selectors';
import { ActiveInvestigationDetails, HMIS_CT_MODULE_OPTIONS } from './radiology-constants';

export function extractActiveInvestigation(): ActiveInvestigationDetails {
  const modal = document.querySelector(HMIS_SELECTORS.RADIOLOGY_REPORT.MODAL_CONTAINER);
  const container = modal || document.body;

  // 1. Check if reporting modal is open
  const isModalOpen = !!(
    modal ||
    document.querySelector(HMIS_SELECTORS.RADIOLOGY_REPORT.REPORT_IFRAME) ||
    document.querySelector(HMIS_SELECTORS.RADIOLOGY_REPORT.REPORT_TEXTAREA)
  );

  // 2. Parse patient info text bar
  const infoText = container.textContent || '';
  const nameMatch = infoText.match(/Name:\s*([^|]+)/i);
  const mrnMatch = infoText.match(/MRN:\s*(\d+)/i) || infoText.match(/MR#?\s*(\d+)/i);
  const ageMatch = infoText.match(/Age:\s*([^|]+)/i);
  const genderMatch = infoText.match(/Gender:\s*([^|]+)/i);
  const cnicMatch = infoText.match(/CNIC:\s*([\d-]+)/i);
  const contactMatch = infoText.match(/Contact:\s*([\d-]+)/i);
  const visitMatch = infoText.match(/Visit:\s*(\d+)/i) || infoText.match(/Token:\s*([A-Za-z0-9-]+)/i);

  // 3. Extract Investigation ID from action buttons or textarea IDs
  let investigationId = '';
  const histBtn = container.querySelector('[wire\\:click*="patientHistoryModal"]');
  if (histBtn) {
    const attr = histBtn.getAttribute('wire:click') || '';
    const m = attr.match(/patientHistoryModal\(['"]?(\d+)['"]?\)/);
    if (m) investigationId = m[1];
  }

  if (!investigationId) {
    const rejectBtn = container.querySelector('[wire\\:click*="patient_investigation_id"]');
    if (rejectBtn) {
      const attr = rejectBtn.getAttribute('wire:click') || '';
      const m = attr.match(/patient_investigation_id['",\s]+['"]?(\d+)/);
      if (m) investigationId = m[1];
    }
  }

  if (!investigationId) {
    const anyTextarea = container.querySelector('textarea[id*="_method_"]');
    if (anyTextarea && anyTextarea.id) {
      const parts = anyTextarea.id.split('_');
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) investigationId = lastPart;
    }
  }

  // 4. Extract Study ID / Accession Number from Image button
  let studyId = '';
  const imgBtn = container.querySelector('[wire\\:click*="getPatientStudies"]');
  if (imgBtn) {
    const attr = imgBtn.getAttribute('wire:click') || '';
    const m = attr.match(/getPatientStudies\(['"]?(\d+)['"]?\)/);
    if (m) studyId = m[1];
  }

  // 5. Extract selected Module ID & Name
  const moduleSelect = container.querySelector<HTMLSelectElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.MODULE_SELECT);
  const moduleId = moduleSelect ? moduleSelect.value : '';
  const matchedModule = HMIS_CT_MODULE_OPTIONS.find((m) => m.value === moduleId);
  const moduleName = matchedModule ? matchedModule.text : moduleSelect?.selectedOptions[0]?.text || '';

  // 6. Extract existing text fields
  const historyEl = container.querySelector<HTMLTextAreaElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.HISTORY_TEXTAREA);
  const reportEl = container.querySelector<HTMLTextAreaElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.REPORT_TEXTAREA);
  const impressionEl = container.querySelector<HTMLTextAreaElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.IMPRESSION_TEXTAREA);
  const commentsEl = container.querySelector<HTMLTextAreaElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.COMMENTS_TEXTAREA);

  return {
    patientName: nameMatch ? nameMatch[1].trim() : '',
    mrn: mrnMatch ? mrnMatch[1].trim() : studyId || '',
    age: ageMatch ? ageMatch[1].trim() : '',
    gender: genderMatch ? genderMatch[1].trim() : '',
    cnic: cnicMatch ? cnicMatch[1].trim() : '',
    contact: contactMatch ? contactMatch[1].trim() : '',
    visitToken: visitMatch ? visitMatch[1].trim() : '',
    investigationId,
    studyId: studyId || (mrnMatch ? mrnMatch[1].trim() : ''),
    moduleId,
    moduleName,
    existingHistory: historyEl?.value || '',
    existingReport: reportEl?.value || '',
    existingImpression: impressionEl?.value || '',
    comments: commentsEl?.value || '',
    isModalOpen,
  };
}
