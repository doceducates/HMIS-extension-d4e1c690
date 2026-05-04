import { handleLogin } from './modules/login-handler';
import { handleDepartmentSelection, handleRoleSelection } from './modules/department-handler';
import { activateAutoPilot } from './modules/patient-workflow';
import { getCurrentConfig } from './modules/config';
import { HMISPageContext, QueuePatient } from './modules/types';
import { HMIS_SELECTORS } from './modules/selectors';
import { WorkflowState, reportStatus, setRunning, broadcastQueueStats } from './modules/state';

/**
 * HMIS Automation Content Script Orchestrator
 * 
 * Runs on every page load within hmis.punjab.gov.pk.
 * Detects context (login, settings, queue, patient encounter)
 * and triggers the appropriate automation handler.
 */
console.log('HMIS Automation: Active.');

let liveConfig: any = null;

async function run() {
    if (!liveConfig) {
        liveConfig = await getCurrentConfig();
    }
    const page = detectPageContext(window.location.pathname);

    // Check if automation is supposed to be running
    const session = await chrome.storage.session.get('workflowState');
    const sessionState = session.workflowState as { isRunning?: boolean } | undefined;
    const wasRunning = sessionState?.isRunning ?? false;

    if (!wasRunning) {
        console.log('HMIS Automation: Idle.');
        return;
    }

    // Reflect state
    WorkflowState.isRunning = true;
    WorkflowState.isStopped = false;

    // ── CRITICAL: Check DOM for patient encounter FIRST ──
    // The encounter page URL also contains '/token/' so URL-based detection
    // alone would misroute it to the queue handler, causing an infinite loop
    // of role switching.
    if (page !== 'LOGIN' && page !== 'DEPARTMENT' && isPatientEncounterPage()) {
        console.log('HMIS Automation: Patient encounter detected via DOM.');
        reportStatus('Patient encounter detected', 'info');
        await activateAutoPilot(liveConfig);
        return;
    }

    switch (page) {
        case 'LOGIN':
            await handleLogin(liveConfig);
            break;

        case 'DEPARTMENT':
            await handleDepartmentSelection(liveConfig);
            break;

        case 'PATIENT_QUEUE':
            await handleRoleSelection(liveConfig);
            // Only process queue if we're on the actual queue listing page
            if (window.location.pathname.includes('/token/today')) {
                await processPatientQueue(liveConfig);
            }
            break;

        case 'UNKNOWN':
        default:
            reportStatus('Unknown page context — waiting', 'info');
            break;
    }
}

/**
 * Detect if the current page is a patient encounter form
 */
function isPatientEncounterPage(): boolean {
    // Multiple checks for robustness
    return !!(
        document.querySelector(HMIS_SELECTORS.NAV.CHECKOUT_BTN) ||
        document.querySelector('#diagnosis-tab') ||
        document.querySelector('a[id^="diagnosis_tab"]') ||
        document.querySelector('a[id^="summary_tab"]') ||
        document.querySelector('#order-investigation-tab')
    );
}

/**
 * Scans the dashboard for patients and opens the first one.
 * Supports continuous queue processing when autoCheckout is enabled.
 */
async function processPatientQueue(config: any) {
    if (!config.autoPilotForm) return;

    reportStatus('Scanning patient queue...', 'progress');
    
    // Wait for the table to fully render
    await new Promise(r => setTimeout(r, 2500));
    
    // Dynamic check: did the user turn off Auto Pilot while we were waiting?
    if (!liveConfig.autoPilotForm) {
        reportStatus('Queue scanning paused', 'info');
        return;
    }

    const patientLink = document.querySelector(HMIS_SELECTORS.DASHBOARD.ANY_PATIENT_LINK) as HTMLElement;
    const patientRows = document.querySelectorAll(HMIS_SELECTORS.DASHBOARD.PATIENT_TABLE + ' tr:not(:has(.dataTables_empty))');
    const isEmpty = document.querySelector(HMIS_SELECTORS.DASHBOARD.EMPTY_QUEUE_INDICATOR);

    // Broadcast stats
    broadcastQueueStats({ totalCount: patientRows.length });

    if (patientLink) {
        const patientName = patientLink.closest('tr')?.querySelector('td:nth-child(3)')?.textContent?.trim() 
            || patientLink.innerText 
            || 'Next Patient';
        reportStatus(`Opening patient: ${patientName}`, 'progress');
        patientLink.click();
    } else if (isEmpty) {
        reportStatus('Queue is empty. Will refresh in 30s...', 'info');
        // Auto-refresh after 30 seconds if still running
        setTimeout(() => {
            if (WorkflowState.isRunning && !WorkflowState.isStopped) {
                const refreshBtn = document.querySelector(HMIS_SELECTORS.DASHBOARD.REFRESH_BTN) as HTMLElement;
                if (refreshBtn) {
                    reportStatus('Refreshing queue...', 'progress');
                    refreshBtn.click();
                } else {
                    // Hard reload the page
                    window.location.reload();
                }
            }
        }, 30000);
    } else {
        reportStatus('No patients found in table.', 'info');
    }
}

function detectPageContext(path: string): HMISPageContext {
    if (path === '/login' || path.endsWith('Login - HMIS.html')) return 'LOGIN';
    if (path === '/login/settings' || path.endsWith('Select Department - HMIS.html')) return 'DEPARTMENT';
    if (path.includes('/token') || path.includes('/doctor') || path.includes('/radiology') || path.includes('/opd')) return 'PATIENT_QUEUE';
    return 'UNKNOWN';
}

// Run on page load
run();

// --- Message handlers from popup ---
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'RUN_WORKFLOW') {
        setRunning(true);
        chrome.storage.session.set({ loginAttempts: 0, setupCompleted: false });
        run().then(() => sendResponse({ success: true }));
        return true;
    }

    if (request.action === 'STOP_WORKFLOW') {
        WorkflowState.isStopped = true;
        WorkflowState.isRunning = false;
        reportStatus('Workflow stopped', 'error');
        chrome.storage.session.set({ loginAttempts: 0, setupCompleted: false });
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'GET_LIVE_QUEUE') {
        const queue = extractLiveQueue();
        sendResponse({ queue });
        return true;
    }

    if (request.action === 'PROCESS_SPECIFIC_PATIENT') {
        const btnId = request.patientId;
        const mode = request.mode;
        const btn = document.getElementById(btnId);
        if (btn) {
            const modeLabel = mode === 'auto' ? 'auto-flow' : mode;
            reportStatus(`Starting ${modeLabel} for patient...`, 'progress');
            setRunning(true);
            
            if (mode === 'auto') {
                chrome.storage.session.set({ 
                    loginAttempts: 0, 
                    setupCompleted: true,
                    isLiveQueuePatient: true
                });
            } else {
                chrome.storage.session.set({ 
                    loginAttempts: 0, 
                    setupCompleted: true,
                    targetedMode: mode,
                    isLiveQueuePatient: true
                });
            }
            btn.click();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Patient not found on current page' });
        }
        return true;
    }
});

/**
 * Extracts the current patient queue from the dashboard table.
 */
function extractLiveQueue(): QueuePatient[] {
    const rows = document.querySelectorAll(HMIS_SELECTORS.DASHBOARD.PATIENT_TABLE + ' tr:not(:has(.dataTables_empty))');
    const queue: QueuePatient[] = [];

    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        // Typical columns: 1:Sr#, 2:Token, 3:Name, 4:MRN, 5:ReferredBy, 6:Status, 7:Age
        if (cols.length >= 7) {
            const token = cols[1]?.textContent?.trim() || '';
            const name = cols[2]?.textContent?.trim() || '';
            const mrn = cols[3]?.textContent?.trim() || '';
            const age = cols[6]?.textContent?.trim() || '';
            
            // The action button contains the unique ID we need to click to open this patient
            const actionBtn = row.querySelector('a[id^="tokenPatButton_"]');
            if (actionBtn) {
                queue.push({
                    id: actionBtn.id,
                    token,
                    name,
                    mrn,
                    age,
                    status: 'Pending'
                });
            }
        }
    });

    return queue;
}
// --- Storage listener for live config updates ---
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && liveConfig) {
        let needsReevaluation = false;

        for (const [key, { newValue }] of Object.entries(changes)) {
            liveConfig[key] = newValue;
            console.log(`[Config] Dynamic update: ${key} = ${newValue}`);
            
            // If any of the main automation toggles are turned ON, we should trigger a re-run
            if (['autoLogin', 'autoDepartment', 'autoPilotForm', 'autoCheckout'].includes(key) && newValue === true) {
                needsReevaluation = true;
            }
        }

        // If the master switch is running and a sub-toggle was just enabled, instantly react
        if (needsReevaluation && WorkflowState.isRunning && !WorkflowState.isStopped) {
            console.log('HMIS Automation: Dynamic toggle enabled. Re-evaluating current page state...');
            run();
        }
    }
});
