import { ExtensionConfig } from "./types";

export const DEFAULT_CONFIG: ExtensionConfig = {
    hmisHospitalId: '19',
    hmisUsername: '',
    hmisPassword: '',
    hmisDepartmentId: '1',
    hmisClinicId: '1503',
    hmisRoleId: '',           // Leave blank; extension will fallback to finding by OPD text
    autoLogin: true,
    autoDepartment: true,
    autoPilotForm: false,     // Default off until workflow is verified
    defaultComplaintId: '',
    defaultDiagnosisType: 'Provisional',
    defaultDiagnosisQuery: '',
    defaultInvestigationName: '',
    autoCheckout: false,
    // AI Assist — disabled by default, user must opt-in
    aiAssistEnabled: false,
    aiConfidenceThreshold: 0.5,
    aiAutoApply: true,
    aiProviderType: 'local',
    aiModelName: 'Xenova/all-MiniLM-L6-v2',
    aiApiUrl: '',
    aiApiKey: '',
    preventDuplicateOrders: true,
};

export async function getCurrentConfig(): Promise<ExtensionConfig> {
    const stored = await chrome.storage.local.get(null);
    return { ...DEFAULT_CONFIG, ...stored };
}
