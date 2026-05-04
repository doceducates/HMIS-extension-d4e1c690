/**
 * Defines the configuration settings for the HMIS workflow automation extension.
 */
export interface ExtensionConfig {
    hmisHospitalId: string;
    hmisUsername: string;
    hmisPassword: string;
    // Workflow Automations
    hmisDepartmentId: string;
    hmisClinicId: string;
    hmisRoleId: string;       // The role ID to switch to (OPD). Found in wire:click of role links.
    autoLogin: boolean;
    autoDepartment: boolean;
    autoPilotForm: boolean;
    // Default form values
    defaultComplaintId: string;
    defaultDiagnosisType: string;
    defaultDiagnosisQuery: string;
    defaultInvestigationName: string;
    autoCheckout: boolean;
    // AI Assist settings
    aiAssistEnabled: boolean;         // Master toggle for Tier 2 AI
    aiConfidenceThreshold: number;    // 0-1, default 0.5 — minimum cosine similarity to accept
    aiAutoApply: boolean;             // true = auto-select best match, false = log suggestions only
    aiProviderType: 'local' | 'api';
    aiModelName: string;
    aiApiUrl: string;
    aiApiKey: string;
    // Advanced Workflow
    preventDuplicateOrders: boolean;
}

export type HMISPageContext = 'LOGIN' | 'DEPARTMENT' | 'DASHBOARD' | 'PATIENT_QUEUE' | 'UNKNOWN';

export interface QueuePatient {
    id: string;        // The DOM ID of the button to click (e.g., tokenPatButton_108187)
    token: string;
    name: string;
    mrn: string;
    age: string;
    status: string;    // E.g. "Pending", "Done"
}

/**
 * Structured patient summary data extracted from HMIS Summary page
 */
export interface PatientSummary {
    demographics: {
        name: string;
        mrn: string;
        age: string;
        gender: string;
    };
    vitals: {
        bp: string;
        pulse: string;
        temp: string;
        weight: string;
    };
    clinical: {
        complaints: string[];
        diagnoses: string[];
        investigations: string[];
        medications: string[];
        allergies: string[];
    };
}

export interface ErrorEntry {
    step: string;
    message: string;
    timestamp: string;
}

export interface PatientRecord {
    id: string;
    timestamp: string;
    patientName: string;
    mrn: string;
    status: 'success' | 'error' | 'partial' | 'skipped' | 'processing';
    scenario: string;
    provisionalDiagnosis: string[];
    investigations: string[];
    completedSteps: string[];
    errors: ErrorEntry[];
    durationMs: number;
    tokenReleased: boolean;
}

export interface SessionStats {
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    partialCount: number;
    skippedCount: number;
    avgDurationMs: number;
    sessionStartedAt: string;
}

export interface StepResult {
    success: boolean;
    skipped: boolean;
    error?: Error;
}
