/**
 * Clinical Rules Engine — Extensible diagnosis ↔ investigation mapping.
 *
 * Handles the real-world variability of HMIS Summary data:
 *
 *   SCENARIO A: Summary has diagnosis + investigation → use both directly
 *   SCENARIO B: Summary has diagnosis but NO investigation → rules suggest investigations
 *   SCENARIO C: Summary has investigation but NO diagnosis → rules suggest diagnosis
 *   SCENARIO D: Summary is empty (no diagnosis, no investigation) → use config defaults
 *
 * This is "Tier 1" of the AI assist system — pure rules, zero overhead.
 * Future Tier 2 (embeddings) and Tier 3 (Bonsai/Gemini Nano) can enhance
 * these decisions when they have a confident match.
 */

import { ExtensionConfig } from './types';
import { reportStatus } from './state';
import { ExtractedSummaryData } from './summary-extractor';

// ════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════

/** The type of radiology item found on the summary page */
export type RadiologyItemType = 'imaging' | 'procedure' | 'unknown';

/** Result of the full resolution logic */
export interface ResolvedWorkflowData {
    diagnoses: string[];
    investigations: string[];
    /** Which scenario was matched — useful for logging and future AI context */
    scenario: 'A' | 'B' | 'C' | 'D';
    /** Human-readable explanation of what the resolver decided */
    reasoning: string;
}

// ════════════════════════════════════════════════════════════════
//  RULE DEFINITIONS
// ════════════════════════════════════════════════════════════════

/**
 * Maps diagnosis keywords → suggested investigation orders.
 * Keywords are matched case-insensitively against the diagnosis text.
 * Order matters: first match wins per diagnosis.
 */
const DIAGNOSIS_TO_INVESTIGATION: Array<{
    keywords: string[];
    investigations: string[];
    ruleName: string;
}> = [
    // ── Musculoskeletal ──
    {
        keywords: ['swelling', 'lump', 'mass', 'nodule', 'soft tissue'],
        investigations: ['USG Swelling'],
        ruleName: 'Soft tissue swelling',
    },
    {
        keywords: ['back pain', 'lumbar', 'lumbosacral', 'disc', 'sciatica', 'radiculopathy', 'spondylosis', 'spondylolisthesis'],
        investigations: ['X-Ray LS Spine', 'MRI Lumbar Spine'],
        ruleName: 'Lumbar spine pathology',
    },
    {
        keywords: ['cervical', 'neck pain', 'cervicalgia'],
        investigations: ['X-Ray Cervical Spine'],
        ruleName: 'Cervical spine pathology',
    },
    {
        keywords: ['fracture', 'trauma', 'injury', 'fall', 'dislocation'],
        investigations: ['X-Ray'],
        ruleName: 'Trauma / fracture',
    },
    {
        keywords: ['joint', 'arthritis', 'knee', 'shoulder', 'elbow', 'wrist', 'ankle', 'hip'],
        investigations: ['X-Ray'],
        ruleName: 'Joint pathology',
    },

    // ── Abdomen / GI ──
    {
        keywords: ['abdominal pain', 'epigastric', 'right hypochondrium', 'hepatomegaly', 'ascites', 'splenomegaly'],
        investigations: ['USG Abdomen'],
        ruleName: 'Abdominal pathology',
    },
    {
        keywords: ['cholecystitis', 'gallbladder', 'gallstone', 'biliary', 'jaundice', 'obstructive'],
        investigations: ['USG Abdomen'],
        ruleName: 'Biliary pathology',
    },
    {
        keywords: ['renal colic', 'kidney stone', 'ureteric', 'flank pain', 'hematuria', 'hydronephrosis'],
        investigations: ['USG KUB', 'CT KUB'],
        ruleName: 'Renal / urological',
    },
    {
        keywords: ['appendicitis', 'right iliac fossa', 'rif pain'],
        investigations: ['USG Abdomen'],
        ruleName: 'Appendicitis workup',
    },

    // ── Chest ──
    {
        keywords: ['chest pain', 'dyspnea', 'shortness of breath', 'cough', 'pneumonia', 'pleural effusion', 'hemoptysis'],
        investigations: ['X-Ray Chest'],
        ruleName: 'Chest symptoms',
    },

    // ── Neuro ──
    {
        keywords: ['headache', 'seizure', 'stroke', 'brain', 'cerebral', 'cva', 'tia', 'unconscious'],
        investigations: ['CT Brain'],
        ruleName: 'Neurological',
    },

    // ── Endocrine / Neck ──
    {
        keywords: ['thyroid', 'goiter', 'neck swelling', 'thyromegaly'],
        investigations: ['USG Thyroid'],
        ruleName: 'Thyroid pathology',
    },

    // ── Breast ──
    {
        keywords: ['breast', 'mammary', 'breast lump'],
        investigations: ['USG Breast', 'Mammography'],
        ruleName: 'Breast pathology',
    },

    // ── Pelvic / GYN ──
    {
        keywords: ['pelvic', 'uterine', 'ovarian', 'adnexal', 'menorrhagia', 'amenorrhea', 'pregnancy', 'ectopic'],
        investigations: ['USG Pelvis'],
        ruleName: 'Pelvic / Gynecological',
    },

    // ── Vascular ──
    {
        keywords: ['dvt', 'deep vein', 'venous thrombosis', 'varicose', 'leg swelling'],
        investigations: ['Doppler Lower Limb'],
        ruleName: 'Venous / vascular',
    },
];

/**
 * Reverse mapping: investigation/procedure name → likely diagnosis.
 * Used when the summary has an investigation listed but NO diagnosis (Scenario C).
 * This helps the extension fill in a sensible provisional diagnosis.
 */
const INVESTIGATION_TO_DIAGNOSIS: Array<{
    keywords: string[];
    diagnosis: string;
    ruleName: string;
}> = [
    // ── Imaging → Diagnosis ──
    { keywords: ['usg abdomen', 'ultrasound abdomen'], diagnosis: 'Abdominal pathology', ruleName: 'USG Abdomen' },
    { keywords: ['usg kub', 'ct kub'], diagnosis: 'Renal colic', ruleName: 'KUB imaging' },
    { keywords: ['usg pelvis'], diagnosis: 'Pelvic pathology', ruleName: 'USG Pelvis' },
    { keywords: ['usg thyroid'], diagnosis: 'Thyroid swelling', ruleName: 'USG Thyroid' },
    { keywords: ['usg breast', 'mammography'], diagnosis: 'Breast lump', ruleName: 'Breast imaging' },
    { keywords: ['usg swelling'], diagnosis: 'Soft tissue swelling', ruleName: 'USG Swelling' },
    { keywords: ['x-ray chest', 'xray chest', 'cxr'], diagnosis: 'Chest symptoms', ruleName: 'Chest X-Ray' },
    { keywords: ['x-ray', 'xray'], diagnosis: 'Musculoskeletal pathology', ruleName: 'General X-Ray' },
    { keywords: ['ct brain', 'ct head'], diagnosis: 'Neurological symptoms', ruleName: 'CT Brain' },
    { keywords: ['ct chest', 'hrct'], diagnosis: 'Chest symptoms', ruleName: 'CT Chest' },
    { keywords: ['ct abdomen', 'ct pelvis', 'ct chest abdomen & pelvis', 'ct scan abdomen'], diagnosis: 'Abdominal pathology', ruleName: 'CT Abdomen/Pelvis' },
    { keywords: ['ct scan films', 'ct scan', 'ct'], diagnosis: 'For CT evaluation', ruleName: 'CT Scan General' },
    { keywords: ['mri'], diagnosis: 'For MRI evaluation', ruleName: 'MRI study' },
    { keywords: ['doppler'], diagnosis: 'Vascular pathology', ruleName: 'Doppler study' },

    // ── Interventional Procedures → Diagnosis ──
    { keywords: ['fnac', 'fine needle'], diagnosis: 'Lesion for biopsy', ruleName: 'FNAC procedure' },
    { keywords: ['pleural tap', 'thoracentesis', 'pleural aspiration'], diagnosis: 'Pleural effusion', ruleName: 'Pleural tap' },
    { keywords: ['ascitic tap', 'paracentesis', 'abdominal tap'], diagnosis: 'Ascites', ruleName: 'Ascitic tap' },
    { keywords: ['embolization', 'embolisation'], diagnosis: 'For embolization', ruleName: 'Embolization' },
    { keywords: ['biopsy', 'core biopsy', 'trucut'], diagnosis: 'Lesion for biopsy', ruleName: 'Biopsy' },
    { keywords: ['drain', 'drainage', 'pigtail'], diagnosis: 'Collection for drainage', ruleName: 'Drainage procedure' },
    { keywords: ['injection', 'steroid injection', 'joint injection'], diagnosis: 'For therapeutic injection', ruleName: 'Injection procedure' },
];

/**
 * Known interventional radiology procedures.
 * These are NOT simple imaging orders — they are procedures that the radiologist performs.
 * The extension should still order them in HMIS, but the resolver treats them differently
 * for diagnosis inference (they carry more clinical weight).
 */
const INTERVENTIONAL_PROCEDURE_KEYWORDS = [
    'fnac', 'fine needle', 'biopsy', 'trucut', 'core biopsy',
    'pleural tap', 'thoracentesis', 'pleural aspiration',
    'ascitic tap', 'paracentesis', 'abdominal tap',
    'embolization', 'embolisation',
    'drain', 'drainage', 'pigtail',
    'injection', 'steroid injection', 'joint injection',
    'angiography', 'angioplasty', 'stent',
    'nephrostomy', 'pcn',
    'ablation', 'rfa', 'radiofrequency',
    'sclerotherapy',
    'vertebroplasty', 'kyphoplasty',
];

// ════════════════════════════════════════════════════════════════
//  MAIN RESOLVER — Handles all 4 scenarios
// ════════════════════════════════════════════════════════════════

import { suggestDiagnoses, suggestInvestigations } from './ai-engine';

/**
 * Central resolver that determines what diagnoses and investigations
 * to fill, based on what was extracted from the Summary page.
 *
 * Returns a complete plan with reasoning for transparency.
 */
export async function resolveWorkflow(
    extracted: ExtractedSummaryData,
    config: ExtensionConfig,
    mode?: 'assess' | 'procedure'
): Promise<ResolvedWorkflowData> {
    const hasDiagnosis = extracted.diagnoses.length > 0;
    const hasInvestigation = extracted.investigations.length > 0;

    // ── Apply Assessment Mode if explicitly requested ──
    // This intercepts any investigations that are procedures and converts them to USG
    let finalInvestigations = extracted.investigations;
    if (mode === 'assess' && hasInvestigation) {
        finalInvestigations = finalInvestigations.map(inv => {
            const invLower = inv.toLowerCase();
            if (['pleural', 'thoracentesis'].some(k => invLower.includes(k))) return 'USG Chest';
            if (['ascitic', 'paracentesis', 'ptbd'].some(k => invLower.includes(k))) return 'USG Abdomen';
            if (['thyroid', 'neck'].some(k => invLower.includes(k))) return 'USG Thyroid';
            if (['breast'].some(k => invLower.includes(k))) return 'USG Breast';
            if (['fnac', 'biopsy', 'trucut', 'core', 'tap', 'drain', 'pigtail', 'collection'].some(k => invLower.includes(k))) return 'USG Swelling';
            return inv; // return original if it's not a known procedural keyword
        });
        // Remove duplicates after mapping
        finalInvestigations = [...new Set(finalInvestigations)];
        reportStatus(`Assessment Mode ON: Converted procedures to USG`, 'info');
    }

    // ── SCENARIO A: Both present — use what the referring doctor ordered ──
    if (hasDiagnosis && finalInvestigations.length > 0) {
        const reasoning = `Summary has ${extracted.diagnoses.length} diagnosis(es) and ${extracted.investigations.length} investigation(s) — using all (Mode: ${mode || 'auto'})`;
        reportStatus(reasoning, 'info');
        return {
            diagnoses: extracted.diagnoses,
            investigations: finalInvestigations,
            scenario: 'A',
            reasoning,
        };
    }

    // ── SCENARIO B: Diagnosis present, NO investigation → rules suggest ──
    if (hasDiagnosis && !hasInvestigation) {
        let investigations = matchDiagnosisToInvestigation(extracted.diagnoses);
        let reasoning = '';

        // Tier 2 Fallback: AI Suggestions
        if (investigations.length === 0 && config.aiAssistEnabled) {
            reportStatus('Tier 1 rules empty — calling Tier 2 AI for investigations...', 'progress');
            const aiSuggestions = await suggestInvestigations(
                extracted.diagnoses.join(' '), 
                3, 
                config.aiConfidenceThreshold
            );
            
            if (aiSuggestions.length > 0) {
                investigations = aiSuggestions.map(s => s.label);
                reasoning = `Tier 2 AI suggested ${investigations.length} investigations for diagnosis`;
                reportStatus(reasoning, 'success');
            }
        }

        if (investigations.length === 0) {
            investigations = config.defaultInvestigationName ? [config.defaultInvestigationName] : [];
            reasoning = investigations.length > 0 
                ? `Summary has diagnosis but no investigation — using default`
                : `Summary has diagnosis but no investigation — no match found`;
            reportStatus(reasoning, 'info');
        } else if (!reasoning) {
            reasoning = `Summary has diagnosis but no investigation — rules suggested ${investigations.length}`;
            reportStatus(reasoning, 'info');
        }

        return {
            diagnoses: extracted.diagnoses,
            investigations,
            scenario: 'B',
            reasoning,
        };
    }

    // ── SCENARIO C: Investigation present, NO diagnosis → infer diagnosis ──
    if (!hasDiagnosis && finalInvestigations.length > 0) {
        let diagnoses = matchInvestigationToDiagnosis(finalInvestigations);
        let reasoning = '';

        // Tier 2 Fallback: AI Suggestions
        if (diagnoses.length === 0 && config.aiAssistEnabled) {
            reportStatus('Tier 1 rules empty — calling Tier 2 AI for diagnosis...', 'progress');
            const aiSuggestions = await suggestDiagnoses(
                finalInvestigations.join(' '), 
                3, 
                config.aiConfidenceThreshold
            );
            
            if (aiSuggestions.length > 0) {
                diagnoses = aiSuggestions.map(s => s.label);
                reasoning = `Tier 2 AI inferred ${diagnoses.length} diagnoses from investigation`;
                reportStatus(reasoning, 'success');
            }
        }

        if (diagnoses.length === 0) {
            diagnoses = config.defaultDiagnosisQuery ? [config.defaultDiagnosisQuery] : [];
            reasoning = diagnoses.length > 0
                ? `Summary has investigation but no diagnosis — using default`
                : `Summary has investigation but no diagnosis — no match found`;
            reportStatus(reasoning, 'info');
        } else if (!reasoning) {
            reasoning = `Summary has investigation but no diagnosis — inferred ${diagnoses.length} diagnosis(es)`;
            reportStatus(reasoning, 'info');
        }

        return {
            diagnoses,
            investigations: finalInvestigations,
            scenario: 'C',
            reasoning,
        };
    }

    // ── SCENARIO D: Both empty — use config defaults ──
    const diagnoses = config.defaultDiagnosisQuery ? [config.defaultDiagnosisQuery] : [];
    const investigations = config.defaultInvestigationName ? [config.defaultInvestigationName] : [];
    const reasoning = 'Summary page is empty — using configured defaults';
    reportStatus(reasoning, 'info');

    return {
        diagnoses,
        investigations,
        scenario: 'D',
        reasoning,
    };
}

// ════════════════════════════════════════════════════════════════
//  MATCHING FUNCTIONS
// ════════════════════════════════════════════════════════════════

/**
 * Given diagnoses, suggest appropriate investigations using clinical rules.
 * Supports multiple diagnoses (each one checked independently).
 */
function matchDiagnosisToInvestigation(diagnoses: string[]): string[] {
    const investigations: string[] = [];

    for (const diag of diagnoses) {
        const diagLower = diag.toLowerCase();

        for (const rule of DIAGNOSIS_TO_INVESTIGATION) {
            const matched = rule.keywords.some(kw => diagLower.includes(kw));
            if (matched) {
                reportStatus(`Rule "${rule.ruleName}" → ${rule.investigations.join(', ')}`, 'info');
                investigations.push(...rule.investigations);
                break; // First matching rule wins per diagnosis
            }
        }
    }

    return [...new Set(investigations)];
}

/**
 * Given investigations/procedures, infer a likely provisional diagnosis.
 * Used for Scenario C (investigation present, no diagnosis).
 */
function matchInvestigationToDiagnosis(investigations: string[]): string[] {
    const diagnoses: string[] = [];

    for (const inv of investigations) {
        const invLower = inv.toLowerCase();

        for (const rule of INVESTIGATION_TO_DIAGNOSIS) {
            const matched = rule.keywords.some(kw => invLower.includes(kw));
            if (matched) {
                reportStatus(`Reverse rule "${rule.ruleName}" → diagnosis: ${rule.diagnosis}`, 'info');
                diagnoses.push(rule.diagnosis);
                break; // First matching rule wins per investigation
            }
        }
    }

    return [...new Set(diagnoses)];
}

// ════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════

/**
 * Classify a radiology item as either an imaging study or an interventional procedure.
 * Useful for future AI context and for adjusting workflow behavior.
 */
export function classifyRadiologyItem(name: string): RadiologyItemType {
    const nameLower = name.toLowerCase();

    if (INTERVENTIONAL_PROCEDURE_KEYWORDS.some(kw => nameLower.includes(kw))) {
        return 'procedure';
    }

    // Common imaging prefixes
    const imagingPrefixes = ['usg', 'ultrasound', 'x-ray', 'xray', 'ct', 'mri', 'mammography', 'doppler', 'fluoroscopy'];
    if (imagingPrefixes.some(prefix => nameLower.includes(prefix))) {
        return 'imaging';
    }

    return 'unknown';
}

/**
 * Get all available rules (for UI display, debugging, or future AI context).
 */
export function getAllRules() {
    return {
        diagnosisToInvestigation: DIAGNOSIS_TO_INVESTIGATION.map(r => ({
            ruleName: r.ruleName,
            keywords: r.keywords,
            investigations: r.investigations,
        })),
        investigationToDiagnosis: INVESTIGATION_TO_DIAGNOSIS.map(r => ({
            ruleName: r.ruleName,
            keywords: r.keywords,
            diagnosis: r.diagnosis,
        })),
        interventionalProcedures: INTERVENTIONAL_PROCEDURE_KEYWORDS,
    };
}
