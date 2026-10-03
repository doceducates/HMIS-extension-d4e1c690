/**
 * HMIS Injected Floating Assistant Dock
 * Sleek glassmorphic overlay mounted directly onto hmis.punjab.gov.pk
 * for seamless 1-click radiology reporting.
 */

import { HMIS_SELECTORS } from './selectors';
import { HMIS_CT_MODULE_OPTIONS } from './radiology-constants';
import {
  extractActiveInvestigation,
  setModuleId,
  triggerHmisSaveDraft,
  triggerHmisFinalSubmit,
  triggerHmisPatientStudies,
  fetchPatientHistoryModal,
} from './radiology-handler';
import { showToast } from './utils';

const DOCK_ID = 'rad-suite-injected-dock';
const OVERLAY_ID = 'rad-suite-pathology-overlay';

export function mountInjectedDock() {
  if (document.getElementById(DOCK_ID)) return;

  const modal = document.querySelector(HMIS_SELECTORS.RADIOLOGY_REPORT.MODAL_CONTAINER);
  if (!modal) return;

  const dock = document.createElement('div');
  dock.id = DOCK_ID;
  dock.style.cssText = `
    position: fixed;
    top: 14px;
    right: 20px;
    z-index: 999999;
    background: rgba(15, 20, 25, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 12px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 16px rgba(34, 211, 238, 0.2);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #e2e8f0;
    font-size: 11px;
    user-select: none;
    transition: all 0.2s ease;
  `;

  // 1. Branding Badge
  const badge = document.createElement('div');
  badge.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: #22d3ee;
    letter-spacing: 0.3px;
    padding-right: 8px;
    border-right: 1px solid rgba(255, 255, 255, 0.12);
  `;
  badge.innerHTML = `
    <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e;"></span>
    <span>RAD SUITE</span>
  `;
  dock.appendChild(badge);

  // 2. Module Quick Dropdown
  const moduleSelect = document.createElement('select');
  moduleSelect.style.cssText = `
    background: #141820;
    color: #e2e8f0;
    border: 1px solid #2a3040;
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 10px;
    font-weight: 600;
    outline: none;
    cursor: pointer;
  `;
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Module';
  moduleSelect.appendChild(defaultOpt);

  HMIS_CT_MODULE_OPTIONS.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.text;
    moduleSelect.appendChild(o);
  });

  const active = extractActiveInvestigation();
  if (active.moduleId) {
    moduleSelect.value = active.moduleId;
  }

  moduleSelect.addEventListener('change', () => {
    if (moduleSelect.value) {
      setModuleId(moduleSelect.value);
      showToast(`Module switched to ${moduleSelect.selectedOptions[0]?.text}`, false);
    }
  });
  dock.appendChild(moduleSelect);

  // Helper for button creation
  const createBtn = (text: string, icon: string, bg: string, border: string, color: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = `
      background: ${bg};
      border: 1px solid ${border};
      color: ${color};
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    `;
    btn.innerHTML = `<span>${icon}</span><span>${text}</span>`;
    btn.addEventListener('mouseenter', () => (btn.style.transform = 'translateY(-1px)'));
    btn.addEventListener('mouseleave', () => (btn.style.transform = 'translateY(0)'));
    btn.addEventListener('click', onClick);
    return btn;
  };

  // 3. Prior Pathology Button
  const pathoBtn = createBtn('Pathology', '🔬', 'rgba(129, 140, 248, 0.15)', 'rgba(129, 140, 248, 0.4)', '#c7d2fe', async () => {
    showToast('Fetching Prior Pathology Reports...', false);
    const activeData = extractActiveInvestigation();
    const reports = await fetchPatientHistoryModal(activeData.investigationId);
    showPathologyOverlay(reports);
  });
  dock.appendChild(pathoBtn);

  // 4. PACS Button
  const pacsBtn = createBtn('PACS', '🖼️', 'rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.15)', '#94a3b8', () => {
    const activeData = extractActiveInvestigation();
    triggerHmisPatientStudies(activeData.studyId || activeData.mrn);
  });
  dock.appendChild(pacsBtn);

  // 5. Save Draft Button (Primary Action)
  const draftBtn = createBtn('Save Draft', '💾', 'rgba(6, 182, 212, 0.2)', 'rgba(6, 182, 212, 0.5)', '#22d3ee', async () => {
    showToast('Saving Draft in HMIS...', false);
    const ok = await triggerHmisSaveDraft();
    if (ok) {
      showToast('✅ Draft Saved & Verified in HMIS!', false);
    } else {
      showToast('⚠️ Could not click Save Draft.', true);
    }
  });
  dock.appendChild(draftBtn);

  // 6. Safety Indicator Badge (Submit Permanently Locked for Testing)
  const safetyBadge = document.createElement('div');
  safetyBadge.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #fbbf24;
    padding: 3px 6px;
    border-radius: 6px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
  `;
  safetyBadge.innerHTML = '<span>🔒</span><span>DRAFT ONLY</span>';
  safetyBadge.title = 'Final Submit is locked to prevent reports from becoming unreachable during testing.';
  dock.appendChild(safetyBadge);

  document.body.appendChild(dock);
}

/**
 * On-screen overlay modal for displaying prior pathology and lab reports.
 */
function showPathologyOverlay(reports: any[]) {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    width: 360px;
    max-height: 480px;
    z-index: 999999;
    background: #141820;
    border: 1px solid #3b4252;
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    padding: 12px;
    color: #e2e8f0;
    font-family: sans-serif;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3040; padding-bottom:6px;';
  header.innerHTML = `
    <strong style="color:#818cf8;">🔬 Prior Pathology & Labs (${reports.length})</strong>
    <button style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer;" id="close-patho-overlay">✕</button>
  `;
  overlay.appendChild(header);

  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto; max-height:400px; display:flex; flex-direction:column; gap:6px;';

  if (reports.length === 0) {
    list.innerHTML = '<div style="color:#64748b; text-align:center; padding:16px;">No prior pathology reports found.</div>';
  } else {
    reports.forEach((r) => {
      const item = document.createElement('div');
      item.style.cssText = 'background:#1a1f2e; border:1px solid #2a3040; border-radius:6px; padding:8px;';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:700; color:#e2e8f0;">
          <span>${r.testName}</span>
          <span style="font-size:9px; color:#94a3b8;">${r.date || ''}</span>
        </div>
        <div style="font-size:10px; color:#38bdf8; margin-top:2px;">Dept: ${r.department} | Status: ${r.status || 'Reported'}</div>
        <div style="margin-top:4px; color:#cbd5e1; font-size:10px; line-height:1.4;">${r.resultSummary || 'Report Available'}</div>
      `;
      list.appendChild(item);
    });
  }

  overlay.appendChild(list);
  document.body.appendChild(overlay);

  document.getElementById('close-patho-overlay')?.addEventListener('click', () => {
    overlay.remove();
  });
}
