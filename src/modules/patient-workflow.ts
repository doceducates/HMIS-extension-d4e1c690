/**
 * Patient Workflow Orchestrator — Coordinates the full patient visit automation.
 *
 * Delegates to focused modules:
 *   - summary-extractor.ts  → Extract data from Summary tab
 *   - clinical-rules.ts     → Resolve the full workflow (diagnoses + investigations)
 *   - diagnosis-handler.ts  → Fill the Diagnosis tab
 *   - investigation-handler.ts → Fill the Investigation tab
 *   - checkout-handler.ts   → Checkout and return to queue
 *   - match-engine.ts       → Fuzzy text matching for search results
 *
 * Handles all real-world Summary page scenarios:
 *   A: Both diagnosis + investigation present → use as-is
 *   B: Diagnosis but no investigation → rules suggest investigations
 *   C: Investigation/procedure but no diagnosis → rules infer diagnosis
 *   D: Empty summary → use configured defaults
 */

import { ExtensionConfig } from './types';
import { HMIS_SELECTORS } from './selectors';
import { waitForLivewire } from './livewire-utils';
import { WorkflowState, reportStatus, broadcastState } from './state';
import { extractDataFromSummary } from './summary-extractor';
import { resolveWorkflow } from './clinical-rules';
import { addDiagnosis } from './diagnosis-handler';
import { addInvestigation } from './investigation-handler';
import { performCheckout, releasePatientToken } from './checkout-handler';
import { savePatientRecord } from './patient-records';
import { PatientRecord } from './types';
import { delay, checkAbort, showToast, TIMING, findByText } from './utils';

// ════════════════════════════════════════════════════════════════
//  WORKFLOW STEP TRACKING
// ════════════════════════════════════════════════════════════════

type WorkflowStep = 'summary' | 'diagnosis' | 'investigation' | 'checkout';

interface WorkflowCheckpoint {
    patientInfo: string;
    completedSteps: WorkflowStep[];
    pendingSteps: WorkflowStep[];
    scenario: string;
    startedAt: string;
}

async function saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    try {
        await chrome.storage.session.set({ workflowCheckpoint: checkpoint });
    } catch {
        // Session storage may not be available — non-critical
    }
}

async function clearCheckpoint(): Promise<void> {
    try {
        await chrome.storage.session.remove('workflowCheckpoint');
    } catch {
        // Silent
    }
}

// ════════════════════════════════════════════════════════════════
//  MAIN AUTOPILOT ENTRY POINT
// ════════════════════════════════════════════════════════════════

/**
 * Automates the full patient visit:
 *   Summary → Diagnosis → Investigation → Checkout
 */
export async function activateAutoPilot(config: ExtensionConfig) {
    console.log('HMIS Automation: Summary-based auto-pilot started.');
    reportStatus('Auto-pilot started', 'info');

    if (!config.autoPilotForm) {
        reportStatus('Auto-pilot disabled in settings', 'info');
        return;
    }

    WorkflowState.isRunning = true;
    WorkflowState.isStopped = false;
    broadcastState();

    const checkpoint: WorkflowCheckpoint = {
        patientInfo: '',
        completedSteps: [],
        pendingSteps: ['summary', 'diagnosis', 'investigation', 'checkout'],
        scenario: '',
        startedAt: new Date().toISOString(),
    };

    const record: PatientRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        patientName: 'Unknown Patient',
        mrn: 'Unknown MRN',
        status: 'processing',
        scenario: '',
        provisionalDiagnosis: [],
        investigations: [],
        completedSteps: [],
        errors: [],
        durationMs: 0,
        tokenReleased: false
    };

    const startTime = Date.now();
    let isLiveQueue = false;

    try {
        // ── Step 1: Navigate to Summary and Extract Data ──
        await saveCheckpoint(checkpoint);
        await navigateToTab(HMIS_SELECTORS.SIDE_MENU.SUMMARY_TEXT, 'Summary');
        await delay(TIMING.SUMMARY_RENDER);
        const extracted = await extractDataFromSummary();
        reportStatus(`Extracted: ${extracted.diagnoses.length} diagnosis(es), ${extracted.investigations.length} investigation(s)`, 'info');
        console.log('Extracted Summary Data:', extracted);

        // Update record — parse patient info from the text bar
        // HMIS uses a flat text bar: "Name: X | Contact: Y | Age: Z | MRN: 123..."
        const patientInfo = extractPatientInfo();
        record.patientName = patientInfo.name;
        record.mrn = patientInfo.mrn;
        checkpoint.patientInfo = patientInfo.name;
        record.completedSteps.push('summary');

        checkpoint.completedSteps.push('summary');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'summary');
        await saveCheckpoint(checkpoint);

        // ── Step 2: Resolve what to fill using the clinical rules engine ──
        // This handles ALL scenarios: both present, diagnosis-only,
        // investigation-only, and completely empty summaries.
        // TIER 2: This now optionally calls the AI embedding model.
        let mode: 'assess' | 'procedure' | undefined;
        try {
            const session = await chrome.storage.session.get(['targetedMode', 'isLiveQueuePatient']);
            mode = session.targetedMode as 'assess' | 'procedure' | undefined;
            isLiveQueue = session.isLiveQueuePatient === true;
            // Clear it so it doesn't leak to next patient if using auto-loop
            await chrome.storage.session.remove(['targetedMode', 'isLiveQueuePatient']);
        } catch { /* Silent */ }

        const resolved = await resolveWorkflow(extracted, config, mode);
        checkpoint.scenario = resolved.scenario;
        await saveCheckpoint(checkpoint);

        record.scenario = resolved.scenario;
        record.provisionalDiagnosis = resolved.diagnoses;
        record.investigations = resolved.investigations;

        reportStatus(`Scenario ${resolved.scenario}: ${resolved.reasoning}`, 'info');
        console.log('Resolved workflow:', resolved);

        // ── Step 3: Fill Diagnosis ──
        if (resolved.diagnoses.length > 0) {
            checkAbort();
            // Dynamic check: did the user turn off Auto Pilot mid-flow?
            if (!config.autoPilotForm) {
                reportStatus('Auto-pilot disabled by user — stopping', 'warning');
                return;
            }

            await navigateToTab(HMIS_SELECTORS.SIDE_MENU.DIAGNOSIS_TEXT, 'Diagnosis');
            await delay(TIMING.TAB_SETTLE);

            for (const diag of resolved.diagnoses) {
                checkAbort();
                try {
                    const result = await addDiagnosis(config.defaultDiagnosisType || 'Provisional', diag, config);
                    if (result.error) {
                        record.errors.push({ step: 'diagnosis', message: result.error.message, timestamp: new Date().toISOString() });
                    }
                } catch (e: any) {
                    record.errors.push({ step: 'diagnosis', message: e.message, timestamp: new Date().toISOString() });
                }
            }
            reportStatus(`Diagnosis step complete (${resolved.diagnoses.length} items)`, 'success');
        } else {
            reportStatus('No diagnosis to fill — skipping', 'info');
        }

        checkpoint.completedSteps.push('diagnosis');
        record.completedSteps.push('diagnosis');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'diagnosis');
        await saveCheckpoint(checkpoint);

        // ── Step 4: Fill Investigation(s) ──
        if (resolved.investigations.length > 0) {
            checkAbort();
            // Dynamic check: did the user turn off Auto Pilot mid-flow?
            if (!config.autoPilotForm) {
                reportStatus('Auto-pilot disabled by user — stopping', 'warning');
                return;
            }

            await navigateToTab(HMIS_SELECTORS.SIDE_MENU.ORDER_TEXT, 'Order');
            await delay(TIMING.SELECT_SETTLE);

            // Click the Investigation sub-tab
            const invTab = document.querySelector(HMIS_SELECTORS.SIDE_MENU.INVESTIGATION_SUBTAB) as HTMLElement
                || findByText('a, button', 'Investigation');
            if (invTab) {
                invTab.click();
                await waitForLivewire(TIMING.SUBTAB_SETTLE);
            }

            for (const inv of resolved.investigations) {
                checkAbort();
                try {
                    const result = await addInvestigation(inv, config);
                    if (result.error) {
                        record.errors.push({ step: 'investigation', message: result.error.message, timestamp: new Date().toISOString() });
                    }
                } catch (e: any) {
                    record.errors.push({ step: 'investigation', message: e.message, timestamp: new Date().toISOString() });
                }
            }
            reportStatus(`Investigation step complete (${resolved.investigations.length} items)`, 'success');
        } else {
            reportStatus('No investigations to order — skipping', 'info');
        }

        checkpoint.completedSteps.push('investigation');
        record.completedSteps.push('investigation');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'investigation');
        await saveCheckpoint(checkpoint);

        // ── Step 5: Checkout ──
        checkAbort();
        // Dynamic Check: Use the LATEST config value for autoCheckout
        if (config.autoCheckout) {
            try {
                await performCheckout();
                checkpoint.completedSteps.push('checkout');
                record.completedSteps.push('checkout');
                checkpoint.pendingSteps = [];
                await saveCheckpoint(checkpoint);
            } catch (e: any) {
                const msg = e.message || 'Checkout failed';
                record.errors.push({ step: 'checkout', message: msg, timestamp: new Date().toISOString() });
                reportStatus(`Checkout failed: ${msg}`, 'error');
                // Release token so patient doesn't stay locked
                await releasePatientToken();
            }
        } else {
            reportStatus('All forms filled ✓ — checkout manually or turn on Auto Checkout', 'success');
            // Wait a bit in case the user turns it on now
            await delay(2000);
            if (config.autoCheckout) {
                reportStatus('Auto Checkout detected — proceeding...', 'progress');
                await performCheckout();
                checkpoint.completedSteps.push('checkout');
                record.completedSteps.push('checkout');
                checkpoint.pendingSteps = [];
                await saveCheckpoint(checkpoint);
            }
        }

        // Clear checkpoint on success
        await clearCheckpoint();

        record.status = record.errors.length > 0 ? 'partial' : 'success';

    } catch (err: any) {
        record.status = 'error';
        record.errors.push({ step: 'workflow', message: err.message || 'Unknown error', timestamp: new Date().toISOString() });
        handleWorkflowError(err);
    } finally {
        // ═══ GUARANTEED TOKEN RELEASE ═══
        if (!record.completedSteps.includes('checkout')) {
            if (isLiveQueue) {
                reportStatus('Kept patient open for manual review/checkout.', 'info');
                record.tokenReleased = false;
            } else {
                await safeReleaseToken(record);
            }
        }

        record.durationMs = Date.now() - startTime;
        if (record.status === 'processing') {
            record.status = record.errors.length > 0 ? 'partial' : 'success';
        }
        await savePatientRecord(record);

        WorkflowState.isRunning = false;
        // broadcastRecordUpdate(record); // will be implemented in popup via GET_RECORDS or broadcast
        broadcastState();
    }
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Navigate to a sidebar tab and wait for Livewire to settle.
 *
 * HMIS sidebar links use href="javascript:void(0)" with wire:click,
 * so CSS href-based selectors DO NOT work. We use text-based matching
 * as the PRIMARY approach (verified working against live DOM).
 */
async function navigateToTab(textLabel: string, name: string) {
    checkAbort();

    // Primary: find by visible text in sidebar links (proven reliable)
    let tab = findByText('a', name) as HTMLElement;

    // Narrow fallback: try common sidebar link selectors
    if (!tab) {
        tab = findByText('.nav-link, .nav-item a, .left_col a, nav a', name) as HTMLElement;
    }

    if (tab) {
        reportStatus(`Navigating to ${name}...`, 'progress');
        tab.click();
        await waitForLivewire(TIMING.TAB_SETTLE);
    } else {
        reportStatus(`Tab "${name}" not found in sidebar`, 'error');
    }
}

/**
 * Extract patient name and MRN from the "Patient Information" text bar.
 *
 * HMIS format (verified live):
 *   "Name: SHAFIA M RIZWAN | Contact: 0300-6566007 | Age: 46y, 2m, 19d | MRN: 19202644951180 | ..."
 *
 * There are NO dedicated CSS classes for individual fields — it's all in one text block.
 */
function extractPatientInfo(): { name: string; mrn: string } {
    // Try multiple containers that might hold the patient info bar
    const containers = document.querySelectorAll(
        '.x_content, [class*="patient"], .right_col > div:first-child, .patient-info-bar'
    );

    let fullText = '';
    for (const container of Array.from(containers)) {
        const text = container.textContent || '';
        if (text.includes('Name:') && text.includes('MRN:')) {
            fullText = text;
            break;
        }
    }

    // If no container matched, try the whole page body (less precise)
    if (!fullText) {
        fullText = document.body.textContent || '';
    }

    const nameMatch = fullText.match(/Name:\s*([^|]+)/);
    const mrnMatch = fullText.match(/MRN:\s*(\d+)/);

    return {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown Patient',
        mrn: mrnMatch ? mrnMatch[1].trim() : 'Unknown MRN',
    };
}

function handleWorkflowError(err: any) {
    if (err.message === 'Aborted by user') {
        reportStatus('Workflow aborted by user', 'error');
    } else {
        console.error('Workflow Error:', err);
        reportStatus(`Error: ${err.message}`, 'error');
        showToast('Automation failed! Check logs.', true);
    }
}

/**
 * Safely releases the patient token to prevent locking.
 */
async function safeReleaseToken(record: PatientRecord): Promise<void> {
    try {
        reportStatus('Releasing patient token to prevent lock...', 'progress');

        // Primary selector (verified working): a[href*="resetTokenHomeButton"]
        const releaseBtn = document.querySelector(HMIS_SELECTORS.NAV.HOME_BTN) as HTMLElement
            || findByText('a, button', 'Release Patient Token') as HTMLElement;

        if (releaseBtn) {
            releaseBtn.click();
            record.tokenReleased = true;
            reportStatus('Patient token released ✓', 'info');
        } else {
            record.tokenReleased = false;
            reportStatus('Warning: Release button not found. Token may be locked.', 'error');
        }
    } catch (e: any) {
        record.tokenReleased = false;
        reportStatus(`Failed to release token: ${e.message}`, 'error');
    }
}
