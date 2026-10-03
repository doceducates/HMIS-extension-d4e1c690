/**
 * HMIS Patient History & Pathology Parser
 *
 * Automates opening the patientHistoryModal, extracting prior lab/pathology
 * reports and previous imaging studies, and safely closing the modal.
 */

import { HMIS_SELECTORS } from './selectors';
import { PathologyHistoryItem } from './radiology-constants';
import { delay } from './utils';

export async function extractPatientHistoryFromDom(): Promise<PathologyHistoryItem[]> {
  const items: PathologyHistoryItem[] = [];
  const modal = document.querySelector(HMIS_SELECTORS.RADIOLOGY_REPORT.PATIENT_HISTORY_MODAL);
  if (!modal) return items;

  // Search tables inside the modal
  const tables = modal.querySelectorAll('table');
  tables.forEach((table) => {
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() || '');
      if (cells.length >= 3) {
        // Typical columns: Date, Department/Category, Test Name, Status, Result
        const fullRowText = cells.join(' ').toLowerCase();
        const isPathology =
          fullRowText.includes('path') ||
          fullRowText.includes('biopsy') ||
          fullRowText.includes('fnac') ||
          fullRowText.includes('cbc') ||
          fullRowText.includes('histo') ||
          fullRowText.includes('lft') ||
          fullRowText.includes('rft') ||
          fullRowText.includes('serology');

        const isRadiology =
          fullRowText.includes('radio') ||
          fullRowText.includes('x-ray') ||
          fullRowText.includes('ct') ||
          fullRowText.includes('mri') ||
          fullRowText.includes('usg') ||
          fullRowText.includes('ultrasound');

        const dept: 'Pathology' | 'Radiology' | 'Other' = isPathology
          ? 'Pathology'
          : isRadiology
          ? 'Radiology'
          : 'Other';

        items.push({
          date: cells[0] || '',
          department: dept,
          testName: cells[1] || cells[2] || 'Investigation',
          status: cells[cells.length - 2] || '',
          resultSummary: cells[cells.length - 1] || cells[2] || '',
        });
      }
    });
  });

  return items;
}

export async function fetchPatientHistoryModal(investigationId?: string): Promise<PathologyHistoryItem[]> {
  const historyBtn = document.querySelector<HTMLElement>(
    investigationId
      ? `[wire\\:click*="patientHistoryModal(${investigationId})"], [wire\\:click*="patientHistoryModal('${investigationId}')"]`
      : HMIS_SELECTORS.RADIOLOGY_REPORT.PATIENT_HISTORY_BTN
  );

  if (!historyBtn) {
    console.warn('[HMIS_RAD] Patient History button not found.');
    return [];
  }

  // Click patient history button
  historyBtn.click();
  await delay(1200); // Allow Livewire modal to load

  const items = await extractPatientHistoryFromDom();

  // Safely close modal
  const closeBtn = document.querySelector<HTMLElement>(HMIS_SELECTORS.RADIOLOGY_REPORT.PATIENT_HISTORY_CLOSE);
  if (closeBtn) {
    closeBtn.click();
  }

  return items;
}
