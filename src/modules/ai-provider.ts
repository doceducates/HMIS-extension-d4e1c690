/**
 * AI Provider Interface — Defines the contract for all AI backends.
 *
 * This allows swapping between local (Transformers.js) and API (OpenAI/HF) 
 * models without changing the core clinical logic.
 */

export interface AISuggestion {
    code: string;
    label: string;
    score: number;
}

export type AIStatus = 'loading' | 'ready' | 'error' | 'disabled' | 'uninstalled' | 'downloading';

/** Full patient context from the Summary page — passed to AI for better decisions */
export interface PatientContext {
    demographics: { name: string; age: string; gender: string };
    complaints: string[];
    existingDiagnoses: string[];     // what's already on the summary
    existingInvestigations: string[]; // what's already ordered
    rawSummaryText: string;           // full text dump of the summary section
}

export interface CandidateRank {
    index: number;
    label: string;
    score: number;
}

/** Every AI provider must implement this */
export interface AIProvider {
    readonly name: string;
    
    init(): Promise<void>;
    
    getStatus(): Promise<AIStatus>;
    
    /** Core method: rank dropdown candidates with full patient context */
    rankCandidates(
        query: string,
        candidates: string[],
        context?: PatientContext,
        topN?: number
    ): Promise<CandidateRank[]>;
    
    /** Suggest diagnosis codes from scratch (pre-computed database) */
    suggestDiagnoses(text: string, topN?: number, minScore?: number): Promise<AISuggestion[]>;
    
    /** Suggest investigation codes from scratch (pre-computed database) */
    suggestInvestigations(text: string, topN?: number, minScore?: number): Promise<AISuggestion[]>;
}
