import { getCurrentConfig } from './modules/config';
import { ExtensionConfig, QueuePatient } from './modules/types';
import type { StatusLevel } from './modules/state';
import { getAIStatus, initAI } from './modules/ai-engine';

interface StatusEntry {
    time: string;
    msg: string;
    level: StatusLevel;
}

interface WorkflowSessionState {
    isRunning: boolean;
    isStopped: boolean;
    currentStep: string;
    statusLog: StatusEntry[];
}

interface PatientRecord {
    id: string;
    timestamp: string;
    patientName: string;
    mrn: string;
    status: 'success' | 'error' | 'partial' | 'skipped' | 'processing';
    scenario: string;
    provisionalDiagnosis: string[];
    investigations: string[];
    completedSteps: string[];
    errors: Array<{ step: string, message: string, timestamp: string }>;
    durationMs: number;
    tokenReleased: boolean;
}

// ─── Element References ───
const statusPill       = document.getElementById('status-pill')!;
const statusPillText   = document.getElementById('status-pill-text')!;
const settingsToggle   = document.getElementById('settings-toggle')!;
const dashboardView    = document.getElementById('dashboard-view')!;
const settingsView     = document.getElementById('settings-view')!;
const backBtn          = document.getElementById('back-btn')!;
const actionBtn        = document.getElementById('action-btn')!;
const actionBtnText    = document.getElementById('action-btn-text')!;
const toggleLogin      = document.getElementById('toggle-login')!;
const toggleDept       = document.getElementById('toggle-dept')!;
const togglePilot      = document.getElementById('toggle-pilot')!;
const toggleCheckout   = document.getElementById('toggle-checkout')!;
const toggleAI         = document.getElementById('toggle-ai')!;
const activityFeed     = document.getElementById('activity-feed')!;
const feedClearBtn     = document.getElementById('feed-clear-btn')!;
const aboutToggle      = document.getElementById('about-toggle')!;
const aboutView        = document.getElementById('about-view')!;
const aboutBackBtn     = document.getElementById('about-back-btn')!;
const footerAboutLink  = document.getElementById('footer-about-link')!;

// Records view elements
const recordsToggle      = document.getElementById('records-toggle')!;
const recordsView        = document.getElementById('records-view')!;
const recordsBackBtn     = document.getElementById('records-back-btn')!;
const recordsList        = document.getElementById('records-list')!;
const clearRecordsBtn    = document.getElementById('clear-records-btn')!;
const statTotal          = document.getElementById('stat-total')!;
const statDone           = document.getElementById('stat-done')!;
const statErr            = document.getElementById('stat-err')!;
const statPartial        = document.getElementById('stat-partial')!;

// Live Queue elements
const queueToggle        = document.getElementById('queue-toggle')!;
const queueView          = document.getElementById('queue-view')!;
const queueBackBtn       = document.getElementById('queue-back-btn')!;
const refreshQueueBtn    = document.getElementById('refresh-queue-btn')!;
const queueList          = document.getElementById('queue-list')!;
const queueStatusText    = document.getElementById('queue-status-text')!;
const queueCountBadge    = document.getElementById('queue-count-badge')!;

// Radiology Workstation elements
const radiologyToggle     = document.getElementById('radiology-toggle')!;
const radiologyView       = document.getElementById('radiology-view')!;
const radBackBtn          = document.getElementById('rad-back-btn')!;
const radRefreshBtn       = document.getElementById('rad-refresh-btn')!;
const radPatientName      = document.getElementById('rad-patient-name')!;
const radPatientMeta      = document.getElementById('rad-patient-meta')!;
const radModalStatus      = document.getElementById('rad-modal-status')!;
const radAgeGender        = document.getElementById('rad-age-gender')!;
const radCnic             = document.getElementById('rad-cnic')!;
const radModuleSelect     = document.getElementById('rad-module-select') as HTMLSelectElement;
const radFetchHistoryBtn  = document.getElementById('rad-fetch-history-btn')!;
const radHistoryList      = document.getElementById('rad-history-list')!;
const radStageBtn         = document.getElementById('rad-stage-btn')!;
const radSaveDraftBtn     = document.getElementById('rad-save-draft-btn')!;
const radSubmitBtn        = document.getElementById('rad-submit-btn')!;
const radPacsBtn          = document.getElementById('rad-pacs-btn')!;
const radRejectBtn        = document.getElementById('rad-reject-btn')!;

// Settings elements
const usernameInput           = document.getElementById('username') as HTMLInputElement;
const passwordInput           = document.getElementById('password') as HTMLInputElement;
const roleIdInput             = document.getElementById('role-id') as HTMLInputElement;
const defaultComplaintInput   = document.getElementById('default-complaint') as HTMLInputElement;
const defaultDiagnosisInput   = document.getElementById('default-diagnosis') as HTMLInputElement;
const defaultInvestigationInput = document.getElementById('default-investigation') as HTMLInputElement;
const preventDuplicatesInput  = document.getElementById('prevent-duplicates') as HTMLInputElement;
const aiThresholdInput        = document.getElementById('ai-threshold') as HTMLInputElement;
const aiThresholdVal          = document.getElementById('ai-threshold-val')!;
const aiStatusPill            = document.getElementById('ai-status-pill')!;
const aiStatusText            = document.getElementById('ai-status-text')!;
const aiInitBtn               = document.getElementById('ai-init-btn')!;
const saveBtn                 = document.getElementById('save-btn')!;
const saveFeedback            = document.getElementById('save-feedback')!;

let isRunning = false;

// ─── Icons for feed entry levels ───
const levelIcons: Record<StatusLevel, string> = {
    success:  '✓',
    error:    '✕',
    progress: '⟳',
    info:     '·',
    warning:  '⚠',
};

// ═══════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════

async function init() {
    // 1. Load saved config into settings fields & toggles
    const config = await getCurrentConfig();
    populateSettings(config);
    syncToggles(config);

    // 2. AI Status Polling
    pollAIStatus();
    setInterval(pollAIStatus, 5000);

    // 3. Recover current workflow state from session storage
    try {
        const state: WorkflowSessionState = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
                resolve(response || { isRunning: false, isStopped: false, currentStep: '', statusLog: [] });
            });
        });

        isRunning = state.isRunning;
        updateActionButton();
        updateStatusPill(state.isRunning ? 'running' : 'idle');

        // Render existing log
        if (state.statusLog && state.statusLog.length > 0) {
            clearFeedPlaceholder();
            state.statusLog.forEach(entry => appendFeedEntry(entry));
            scrollFeedToBottom();
        }
    } catch {
        // Background may not be ready
    }

    // 4. Listen for live updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'STATUS_UPDATE') {
            const { entry, isRunning: running } = message.payload;
            isRunning = running;
            updateActionButton();
            updateStatusPill(running ? 'running' : (entry.level === 'error' ? 'error' : 'idle'));
            clearFeedPlaceholder();
            appendFeedEntry(entry);
            scrollFeedToBottom();
        }

        if (message.type === 'STATE_CHANGE') {
            isRunning = message.payload.isRunning;
            updateActionButton();
            updateStatusPill(isRunning ? 'running' : 'idle');
        }

        if (message.type === 'RECORD_UPDATE') {
            loadAndRenderRecords();
        }

        if (message.type === 'QUEUE_STATS') {
            const { totalCount } = message.payload;
            updateQueueDisplay(totalCount);
        }

        if (message.type === 'AI_PROGRESS') {
            const { percent, status } = message.payload;
            aiStatusText.textContent = `Downloading: ${percent}%`;
            aiStatusPill.className = 'status-pill running';
            aiInitBtn.textContent = 'Downloading...';
            aiInitBtn.setAttribute('disabled', 'true');
            
            if (percent === 100 && status === 'downloading') {
                setTimeout(pollAIStatus, 1000); // Wait for indexing
            }
        }
    });

    // 5. Load initial records
    loadAndRenderRecords();

    // 6. Wire up event handlers
    bindEvents();
}

// ═══════════════════════════════════════════
//  VIEW SWITCHING
// ═══════════════════════════════════════════

function showSettings() {
    dashboardView.classList.add('hidden');
    aboutView.classList.add('hidden');
    recordsView.classList.add('hidden');
    queueView.classList.add('hidden');
    radiologyView.classList.add('hidden');
    settingsView.classList.remove('hidden');
    settingsToggle.classList.add('active');
    aboutToggle.classList.remove('active');
    recordsToggle.classList.remove('active');
    queueToggle.classList.remove('active');
    radiologyToggle.classList.remove('active');
}

function showDashboard() {
    settingsView.classList.add('hidden');
    aboutView.classList.add('hidden');
    recordsView.classList.add('hidden');
    queueView.classList.add('hidden');
    radiologyView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    settingsToggle.classList.remove('active');
    aboutToggle.classList.remove('active');
    recordsToggle.classList.remove('active');
    queueToggle.classList.remove('active');
    radiologyToggle.classList.remove('active');
}

function showAbout() {
    dashboardView.classList.add('hidden');
    settingsView.classList.add('hidden');
    recordsView.classList.add('hidden');
    queueView.classList.add('hidden');
    radiologyView.classList.add('hidden');
    aboutView.classList.remove('hidden');
    aboutToggle.classList.add('active');
    settingsToggle.classList.remove('active');
    recordsToggle.classList.remove('active');
    queueToggle.classList.remove('active');
    radiologyToggle.classList.remove('active');
}

function showRecords() {
    dashboardView.classList.add('hidden');
    settingsView.classList.add('hidden');
    aboutView.classList.add('hidden');
    queueView.classList.add('hidden');
    radiologyView.classList.add('hidden');
    recordsView.classList.remove('hidden');
    recordsToggle.classList.add('active');
    settingsToggle.classList.remove('active');
    aboutToggle.classList.remove('active');
    queueToggle.classList.remove('active');
    radiologyToggle.classList.remove('active');
    loadAndRenderRecords();
}

function showQueue() {
    dashboardView.classList.add('hidden');
    settingsView.classList.add('hidden');
    aboutView.classList.add('hidden');
    recordsView.classList.add('hidden');
    radiologyView.classList.add('hidden');
    queueView.classList.remove('hidden');
    queueToggle.classList.add('active');
    recordsToggle.classList.remove('active');
    settingsToggle.classList.remove('active');
    aboutToggle.classList.remove('active');
    radiologyToggle.classList.remove('active');
    loadLiveQueue();
}

function showRadiology() {
    dashboardView.classList.add('hidden');
    settingsView.classList.add('hidden');
    aboutView.classList.add('hidden');
    recordsView.classList.add('hidden');
    queueView.classList.add('hidden');
    radiologyView.classList.remove('hidden');
    radiologyToggle.classList.add('active');
    queueToggle.classList.remove('active');
    recordsToggle.classList.remove('active');
    settingsToggle.classList.remove('active');
    aboutToggle.classList.remove('active');
    loadActiveInvestigation();
}

let currentInvestigation: any = null;

function loadActiveInvestigation() {
    radPatientName.textContent = 'Scanning HMIS Form...';
    radModalStatus.textContent = 'Detecting';
    radModalStatus.style.color = 'var(--text-muted)';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_CURRENT_INVESTIGATION' }, (response) => {
            if (response?.data) {
                currentInvestigation = response.data;
                const inv = response.data;
                if (inv.isModalOpen || inv.patientName || inv.mrn) {
                    radPatientName.textContent = inv.patientName || 'Patient Detected';
                    radPatientMeta.textContent = `MRN: ${inv.mrn || '--'} | Inv ID: ${inv.investigationId || '--'}`;
                    radModalStatus.textContent = inv.isModalOpen ? 'Modal Active' : 'Page Active';
                    radModalStatus.style.color = 'var(--success)';
                    radAgeGender.textContent = `Age/Sex: ${inv.age || '--'} / ${inv.gender || '--'}`;
                    radCnic.textContent = `CNIC: ${inv.cnic || '--'}`;
                    if (inv.moduleId) {
                        radModuleSelect.value = inv.moduleId;
                    }
                } else {
                    radPatientName.textContent = 'No Reporting Form Open';
                    radPatientMeta.textContent = 'Open an "Add Result" modal on HMIS portal.';
                    radModalStatus.textContent = 'Modal Closed';
                    radModalStatus.style.color = 'var(--warning)';
                }
            } else {
                radPatientName.textContent = 'HMIS Not Active';
                radPatientMeta.textContent = 'Navigate to hmis.punjab.gov.pk.';
                radModalStatus.textContent = 'Disconnected';
                radModalStatus.style.color = 'var(--danger)';
            }
        });
    });
}

// ═══════════════════════════════════════════
//  UI STATE UPDATES
// ═══════════════════════════════════════════

function updateActionButton() {
    if (isRunning) {
        actionBtn.className = 'action-btn stop';
        actionBtnText.textContent = 'Stop Automation';
        actionBtn.querySelector('.btn-icon')!.textContent = '⏹';
    } else {
        actionBtn.className = 'action-btn start';
        actionBtnText.textContent = 'Start Automation';
        actionBtn.querySelector('.btn-icon')!.textContent = '▶';
    }
}

function updateStatusPill(state: 'idle' | 'running' | 'error') {
    statusPill.className = `status-pill ${state}`;
    statusPillText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
}

async function pollAIStatus() {
    const status = await getAIStatus();
    
    if (status === 'uninstalled') {
        aiStatusText.textContent = 'Model Not Found';
        aiStatusPill.className = 'status-pill idle';
        aiInitBtn.textContent = 'Download AI Model';
    } else if (status === 'downloading') {
        // Status text will be updated by AI_PROGRESS message
        aiStatusPill.className = 'status-pill running';
        aiInitBtn.textContent = 'Downloading...';
        aiInitBtn.setAttribute('disabled', 'true');
    } else if (status === 'ready') {
        aiStatusText.textContent = 'AI Ready';
        aiStatusPill.className = 'status-pill running';
        aiInitBtn.textContent = 'Reload Model';
        aiInitBtn.removeAttribute('disabled');
    } else {
        aiStatusText.textContent = `AI ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        aiStatusPill.className = `status-pill ${status === 'error' ? 'error' : 'idle'}`;
        aiInitBtn.textContent = 'Reload Model';
        aiInitBtn.removeAttribute('disabled');
    }
}

function updateQueueDisplay(count: number) {
    console.log(`Queue updated: ${count} patients remaining`);
    const queueBadge = document.getElementById('queue-badge');
    if (queueBadge) {
        queueBadge.textContent = count.toString();
        queueBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// ═══════════════════════════════════════════
//  PATIENT RECORDS
// ═══════════════════════════════════════════

async function loadAndRenderRecords() {
    chrome.runtime.sendMessage({ type: 'GET_RECORDS' }, (records: PatientRecord[]) => {
        renderRecords(records || []);
    });
}

function renderRecords(records: PatientRecord[]) {
    // 1. Update stats
    const today = new Date().toISOString().split('T')[0];
    const todaysRecords = records.filter(r => r.timestamp.startsWith(today));
    
    statTotal.textContent = todaysRecords.length.toString();
    statDone.textContent = todaysRecords.filter(r => r.status === 'success').length.toString();
    statErr.textContent = todaysRecords.filter(r => r.status === 'error').length.toString();
    statPartial.textContent = todaysRecords.filter(r => r.status === 'partial').length.toString();

    // 2. Clear and render list
    recordsList.innerHTML = '';

    if (todaysRecords.length === 0) {
        recordsList.innerHTML = `
            <div class="feed-empty">
                <span class="empty-icon">📂</span>
                <span>No records for today</span>
            </div>
        `;
        return;
    }

    // Sort newest first
    const sorted = [...todaysRecords].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    sorted.forEach(record => {
        const card = document.createElement('div');
        card.className = `record-card status-${record.status}`;
        card.style.background = 'var(--bg-panel)';
        card.style.border = '1px solid var(--border)';
        card.style.borderRadius = 'var(--radius)';
        card.style.padding = '10px';
        card.style.cursor = 'pointer';
        card.style.transition = 'all 0.2s ease';
        card.style.marginBottom = '8px';

        const time = new Date(record.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
        card.innerHTML = `
            <div class="record-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <div style="font-weight: 600; font-size: 13px; color: var(--text);">${escapeHtml(record.patientName)}</div>
                <div class="status-badge" style="font-size: 9px; padding: 2px 6px; border-radius: 10px; background: ${getStatusColor(record.status, true)}; color: ${getStatusColor(record.status)}; font-weight: 700; text-transform: uppercase;">${record.status}</div>
            </div>
            <div class="record-meta" style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
                <span>MRN: ${record.mrn}</span>
                <span>${time}</span>
            </div>
            <div class="record-details hidden" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 11px;">
                <div style="margin-bottom: 4px;"><strong>Diagnoses:</strong> ${record.provisionalDiagnosis.length > 0 ? record.provisionalDiagnosis.join(', ') : 'None'}</div>
                <div style="margin-bottom: 4px;"><strong>Investigations:</strong> ${record.investigations.length > 0 ? record.investigations.join(', ') : 'None'}</div>
                ${record.errors.length > 0 ? `<div style="color: var(--danger); margin-top: 4px;"><strong>Errors:</strong> ${record.errors.map(e => `[${e.step}] ${e.message}`).join('; ')}</div>` : ''}
                <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                    <span>Duration: ${Math.round(record.durationMs / 1000)}s</span>
                    <span>Token Released: ${record.tokenReleased ? 'Yes ✓' : 'No'}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', (e) => {
            const details = card.querySelector('.record-details')!;
            details.classList.toggle('hidden');
        });

        recordsList.appendChild(card);
    });
}

function getStatusColor(status: string, isBg = false) {
    switch(status) {
        case 'success': return isBg ? 'var(--success-bg)' : 'var(--success)';
        case 'error': return isBg ? 'var(--danger-bg)' : 'var(--danger)';
        case 'partial': return isBg ? 'var(--warning-bg)' : 'var(--warning)';
        default: return isBg ? 'var(--bg-panel)' : 'var(--text-muted)';
    }
}

async function clearRecords() {
    if (confirm('Clear all patient records for today?')) {
        chrome.runtime.sendMessage({ type: 'CLEAR_RECORDS' }, () => {
            loadAndRenderRecords();
        });
    }
}

// ═══════════════════════════════════════════
//  LIVE PATIENT QUEUE
// ═══════════════════════════════════════════

function loadLiveQueue() {
    queueStatusText.textContent = 'Fetching...';
    queueList.innerHTML = `
        <div class="feed-empty">
            <span class="empty-icon">👥</span>
            <span>Loading queue...</span>
        </div>
    `;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url?.includes('hmis.punjab.gov.pk')) {
            chrome.tabs.sendMessage(tab.id, { action: 'GET_LIVE_QUEUE' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    queueStatusText.textContent = 'Not on token page';
                    queueCountBadge.textContent = '0 Patients';
                    queueList.innerHTML = `
                        <div class="feed-empty">
                            <span class="empty-icon" style="color: var(--danger)">⚠</span>
                            <span>Please open the HMIS Token Queue page first.</span>
                        </div>
                    `;
                } else if (response.queue) {
                    renderQueue(response.queue);
                }
            });
        } else {
            queueStatusText.textContent = 'Not on HMIS';
            queueCountBadge.textContent = '0 Patients';
            queueList.innerHTML = `
                <div class="feed-empty">
                    <span class="empty-icon" style="color: var(--danger)">⚠</span>
                    <span>Please open the HMIS Token Queue page.</span>
                </div>
            `;
        }
    });
}

function renderQueue(queue: QueuePatient[]) {
    queueList.innerHTML = '';
    queueStatusText.textContent = 'Live';
    queueStatusText.style.color = 'var(--success)';
    queueCountBadge.textContent = `${queue.length} Patient${queue.length !== 1 ? 's' : ''}`;

    if (queue.length === 0) {
        queueList.innerHTML = `
            <div class="feed-empty">
                <span class="empty-icon">✅</span>
                <span>Queue is empty!</span>
            </div>
        `;
        return;
    }

    queue.forEach((patient, index) => {
        const card = document.createElement('div');
        card.className = 'queue-card';

        card.innerHTML = `
            <div class="queue-card-header">
                <div>
                    <div class="queue-card-name">${escapeHtml(patient.name)}</div>
                    <div class="queue-card-meta">MRN: ${patient.mrn} | Age: ${patient.age}</div>
                </div>
                <div class="queue-card-token">Token: ${patient.token}</div>
            </div>
            <div class="queue-btn-group">
                <button class="queue-btn assess" data-tooltip="Assessment Mode: Convert procedures to USG" data-id="${patient.id}">🩺</button>
                <button class="queue-btn procedure" data-tooltip="Procedure Mode: Keep procedures as-is" data-id="${patient.id}">💉</button>
                <button class="queue-btn auto" data-tooltip="Auto Mode: Use defaults from summary" data-id="${patient.id}">⚡</button>
            </div>
        `;

        const assessBtn = card.querySelector('.queue-btn.assess') as HTMLButtonElement;
        const procedureBtn = card.querySelector('.queue-btn.procedure') as HTMLButtonElement;
        const autoBtn = card.querySelector('.queue-btn.auto') as HTMLButtonElement;

        assessBtn?.addEventListener('click', () => {
            processSpecificPatient(patient.id, 'assess', assessBtn);
        });

        procedureBtn?.addEventListener('click', () => {
            processSpecificPatient(patient.id, 'procedure', procedureBtn);
        });

        autoBtn?.addEventListener('click', () => {
            processSpecificPatient(patient.id, 'auto', autoBtn);
        });

        queueList.appendChild(card);
    });
}

function processSpecificPatient(patientId: string, mode: 'assess' | 'procedure' | 'auto', btnElement: HTMLButtonElement) {
    btnElement.textContent = '...';
    btnElement.style.opacity = '0.7';
    btnElement.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'PROCESS_SPECIFIC_PATIENT', patientId, mode }, (response) => {
                if (response?.success) {
                    showDashboard(); // Switch back to dashboard to see logs
                } else {
                    btnElement.textContent = '✕';
                    btnElement.style.background = 'var(--danger)';
                    alert('Error: ' + (response?.error || 'Could not communicate with page'));
                }
            });
        }
    });
}

// ═══════════════════════════════════════════
//  ACTIVITY FEED
// ═══════════════════════════════════════════

function clearFeedPlaceholder() {
    const empty = activityFeed.querySelector('.feed-empty');
    if (empty) empty.remove();
}

function appendFeedEntry(entry: StatusEntry) {
    const el = document.createElement('div');
    el.className = `feed-entry ${entry.level}`;
    el.innerHTML = `
        <span class="fe-time">${entry.time}</span>
        <span class="fe-icon">${levelIcons[entry.level] || '·'}</span>
        <span class="fe-msg">${escapeHtml(entry.msg)}</span>
    `;
    activityFeed.appendChild(el);
}

function scrollFeedToBottom() {
    activityFeed.scrollTop = activityFeed.scrollHeight;
}

function clearFeed() {
    activityFeed.innerHTML = `
        <div class="feed-empty">
            <span class="empty-icon">📋</span>
            <span>No activity yet</span>
        </div>
    `;
    chrome.runtime.sendMessage({ type: 'CLEAR_LOG' });
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════════
//  TOGGLE CHIPS
// ═══════════════════════════════════════════

function syncToggles(config: ExtensionConfig) {
    toggleLogin.classList.toggle('active', config.autoLogin);
    toggleDept.classList.toggle('active', config.autoDepartment);
    togglePilot.classList.toggle('active', config.autoPilotForm);
    toggleCheckout.classList.toggle('active', config.autoCheckout);
    toggleAI.classList.toggle('active', config.aiAssistEnabled);
}

async function handleToggle(chipEl: HTMLElement, key: keyof ExtensionConfig) {
    const currentConfig = await getCurrentConfig();
    const newValue = !currentConfig[key];
    await chrome.storage.local.set({ [key]: newValue });
    chipEl.classList.toggle('active', newValue as boolean);
    return newValue;
}

// ═══════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════

function populateSettings(config: ExtensionConfig) {
    usernameInput.value            = config.hmisUsername || '';
    passwordInput.value            = config.hmisPassword || '';
    roleIdInput.value              = config.hmisRoleId || '';
    defaultComplaintInput.value    = config.defaultComplaintId || '';
    defaultDiagnosisInput.value    = config.defaultDiagnosisQuery || '';
    defaultInvestigationInput.value = config.defaultInvestigationName || '';
    
    // AI Settings
    aiThresholdInput.value         = (config.aiConfidenceThreshold || 0.5).toString();
    aiThresholdVal.textContent     = (config.aiConfidenceThreshold || 0.5).toFixed(2);
    
    // Advanced Settings
    preventDuplicatesInput.checked = config.preventDuplicateOrders ?? true;
}

async function saveSettings() {
    const newSettings: Partial<ExtensionConfig> = {
        hmisUsername:             usernameInput.value.trim(),
        hmisPassword:            passwordInput.value.trim(),
        hmisRoleId:              roleIdInput.value.trim(),
        defaultComplaintId:      defaultComplaintInput.value.trim(),
        defaultDiagnosisQuery:   defaultDiagnosisInput.value.trim(),
        defaultInvestigationName: defaultInvestigationInput.value.trim(),
        aiConfidenceThreshold:   parseFloat(aiThresholdInput.value),
        preventDuplicateOrders:  preventDuplicatesInput.checked,
    };

    try {
        await chrome.storage.local.set(newSettings);
        showSaveFeedback('Settings saved ✓', 'success');
    } catch {
        showSaveFeedback('Error saving settings', 'error');
    }
}

function showSaveFeedback(msg: string, type: 'success' | 'error') {
    saveFeedback.textContent = msg;
    saveFeedback.className = `save-feedback ${type}`;
    setTimeout(() => {
        saveFeedback.textContent = '';
    }, 2500);
}

// ═══════════════════════════════════════════
//  ACTION BUTTON (START / STOP)
// ═══════════════════════════════════════════

function handleAction() {
    if (isRunning) {
        // STOP
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, { action: 'STOP_WORKFLOW' });
            }
        });
        isRunning = false;
        updateActionButton();
        updateStatusPill('idle');

        // Also tell background to persist stopped state
        chrome.runtime.sendMessage({
            type: 'STATE_CHANGE',
            payload: { isRunning: false, isStopped: true, currentStep: 'Stopped by user' },
        });
    } else {
        // START
        isRunning = true;
        updateActionButton();
        updateStatusPill('running');
        clearFeedPlaceholder();
        appendFeedEntry({
            time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            msg: 'Workflow started',
            level: 'progress',
        });
        scrollFeedToBottom();

        // Tell background to persist running state FIRST
        // This ensures content script sees isRunning=true on page load
        chrome.runtime.sendMessage({
            type: 'STATE_CHANGE',
            payload: { isRunning: true, isStopped: false, currentStep: 'Starting...' },
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id && tab.url?.includes('hmis.punjab.gov.pk')) {
                chrome.tabs.sendMessage(tab.id, { action: 'RUN_WORKFLOW' });
            } else {
                // Not on HMIS — open it. Content script will auto-run 
                // because session state now has isRunning=true
                chrome.tabs.create({ url: 'https://hmis.punjab.gov.pk/login' });
                appendFeedEntry({
                    time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
                    msg: 'Launching HMIS...',
                    level: 'info',
                });
                scrollFeedToBottom();
            }
        });
    }
}

// ═══════════════════════════════════════════
//  EVENT BINDINGS
// ═══════════════════════════════════════════

function bindEvents() {
    // View switching
    settingsToggle.addEventListener('click', () => {
        if (settingsView.classList.contains('hidden')) {
            showSettings();
        } else {
            showDashboard();
        }
    });

    aboutToggle.addEventListener('click', () => {
        if (aboutView.classList.contains('hidden')) {
            showAbout();
        } else {
            showDashboard();
        }
    });

    recordsToggle.addEventListener('click', () => {
        if (recordsView.classList.contains('hidden')) {
            showRecords();
        } else {
            showDashboard();
        }
    });

    queueToggle.addEventListener('click', () => {
        if (queueView.classList.contains('hidden')) {
            showQueue();
        } else {
            showDashboard();
        }
    });

    radiologyToggle.addEventListener('click', () => {
        if (radiologyView.classList.contains('hidden')) {
            showRadiology();
        } else {
            showDashboard();
        }
    });

    radBackBtn.addEventListener('click', showDashboard);

    radRefreshBtn.addEventListener('click', () => {
        loadActiveInvestigation();
    });

    radModuleSelect.addEventListener('change', () => {
        if (!radModuleSelect.value) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'SET_MODULE_ID',
                moduleId: radModuleSelect.value
            });
        });
    });

    radFetchHistoryBtn.addEventListener('click', () => {
        radFetchHistoryBtn.textContent = 'Fetching...';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'GET_PATIENT_HISTORY',
                investigationId: currentInvestigation?.investigationId
            }, (res) => {
                radFetchHistoryBtn.textContent = 'Fetch History';
                if (res?.data && res.data.length > 0) {
                    radHistoryList.innerHTML = '';
                    res.data.forEach((r: any) => {
                        const item = document.createElement('div');
                        item.style.cssText = 'background:var(--bg-input); border:1px solid var(--border); border-radius:4px; padding:4px 6px;';
                        item.innerHTML = `<strong>${r.testName}</strong> <span style="font-size:9px; color:var(--text-dim);">(${r.date || ''})</span><br><span style="color:var(--accent);">${r.department}</span> - ${r.resultSummary || r.status || ''}`;
                        radHistoryList.appendChild(item);
                    });
                } else {
                    radHistoryList.innerHTML = '<div style="text-align:center; padding:8px; color:var(--text-dim);">No prior pathology or radiology reports found.</div>';
                }
            });
        });
    });

    radSaveDraftBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SAVE_DRAFT' });
        });
    });

    radSubmitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to finalize and legally submit this report to HMIS?')) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]?.id) return;
                chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SUBMIT_FINAL' });
            });
        }
    });

    radPacsBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'TRIGGER_PATIENT_STUDIES',
                studyId: currentInvestigation?.studyId || currentInvestigation?.mrn
            });
        });
    });

    radRejectBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reject this investigation?')) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]?.id) return;
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'TRIGGER_REJECT_INVESTIGATION',
                    investigationId: currentInvestigation?.investigationId
                });
            });
        }
    });

    radStageBtn.addEventListener('click', async () => {
        const staged = await chrome.storage.session.get('stagedRadiologyReport');
        if (staged?.stagedRadiologyReport) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]?.id) return;
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'FILL_RADIOLOGY_REPORT',
                    payload: staged.stagedRadiologyReport
                });
            });
        } else {
            alert('No report staged from Rad Suite yet. Open a study in Rad Suite and click Stage Report.');
        }
    });

    backBtn.addEventListener('click', showDashboard);
    aboutBackBtn.addEventListener('click', showDashboard);
    recordsBackBtn.addEventListener('click', showDashboard);
    queueBackBtn.addEventListener('click', showDashboard);
    radBackBtn.addEventListener('click', showDashboard);
    footerAboutLink.addEventListener('click', showAbout);

    refreshQueueBtn.addEventListener('click', () => {
        const icon = refreshQueueBtn.textContent;
        refreshQueueBtn.textContent = '...';
        loadLiveQueue();
        setTimeout(() => refreshQueueBtn.textContent = icon, 500);
    });

    clearRecordsBtn.addEventListener('click', clearRecords);

    // Action button
    actionBtn.addEventListener('click', handleAction);

    // Toggle chips
    toggleLogin.addEventListener('click', () => handleToggle(toggleLogin, 'autoLogin'));
    toggleDept.addEventListener('click', () => handleToggle(toggleDept, 'autoDepartment'));
    togglePilot.addEventListener('click', () => handleToggle(togglePilot, 'autoPilotForm'));
    toggleCheckout.addEventListener('click', () => handleToggle(toggleCheckout, 'autoCheckout'));
    
    toggleAI.addEventListener('click', async () => {
        const enabled = await handleToggle(toggleAI, 'aiAssistEnabled');
        if (enabled) {
            initAI(); // Warm up model
            pollAIStatus();
        }
    });

    // AI Threshold Slider
    aiThresholdInput.addEventListener('input', () => {
        aiThresholdVal.textContent = parseFloat(aiThresholdInput.value).toFixed(2);
    });

    // AI Init Button
    aiInitBtn.addEventListener('click', async () => {
        const currentStatus = await getAIStatus();
        if (currentStatus === 'uninstalled') {
            aiStatusText.textContent = 'Initializing...';
        } else {
            aiStatusText.textContent = 'AI Reloading...';
        }
        aiStatusPill.className = 'status-pill running';
        aiInitBtn.setAttribute('disabled', 'true');
        await initAI();
        pollAIStatus();
    });

    // Feed clear
    feedClearBtn.addEventListener('click', clearFeed);

    // Settings save
    saveBtn.addEventListener('click', saveSettings);
}

// ─── Boot ───
init();
