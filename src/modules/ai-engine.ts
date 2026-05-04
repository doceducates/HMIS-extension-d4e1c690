/**
 * AI Engine — Public API for the AI embedding model.
 *
 * Provides a clean interface for other modules (clinical-rules.ts, popup.ts)
 * to request AI-powered suggestions. Communicates with the offscreen document
 * via chrome.runtime messaging through the background service worker.
 *
 * Usage:
 *   import { suggestDiagnoses, suggestInvestigations, getAIStatus } from './ai-engine';
 *   const suggestions = await suggestDiagnoses("bilateral pleural thickening");
 *   // → [{ code: "J94.0", label: "Pleural thickening", score: 0.82 }, ...]
 */

import { AIProvider, AISuggestion, AIStatus, PatientContext, CandidateRank } from './ai-provider';
import { LocalAIProvider } from './ai-provider-local';
import { APIAIProvider } from './ai-provider-api';
import { getCurrentConfig } from './config';

// ════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════

export type { AISuggestion, AIStatus };

// ════════════════════════════════════════════════════════════════
//  PROVIDER MANAGEMENT
// ════════════════════════════════════════════════════════════════

let activeProvider: AIProvider | null = null;

async function ensureProvider(): Promise<AIProvider> {
    if (activeProvider) return activeProvider;

    const config = await getCurrentConfig();
    if (config.aiProviderType === 'api') {
        activeProvider = new APIAIProvider(config);
    } else {
        activeProvider = new LocalAIProvider();
    }
    return activeProvider;
}

export function setProvider(provider: AIProvider) {
    activeProvider = provider;
}

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Initialize the AI engine. Should be called once when the user
 * enables AI assist. Creates the offscreen document and loads the model.
 */
export async function initAI(): Promise<AIStatus> {
    try {
        const provider = await ensureProvider();
        await provider.init();
        return await provider.getStatus();
    } catch (err) {
        console.error('[AI Engine] Init failed:', err);
        return 'error';
    }
}

/**
 * Get the current status of the AI engine.
 */
export async function getAIStatus(): Promise<AIStatus> {
    try {
        const provider = await ensureProvider();
        return await provider.getStatus();
    } catch {
        return 'error';
    }
}

/**
 * Rank a list of candidate strings against a query with patient context.
 */
export async function rankCandidates(
    query: string,
    candidates: string[],
    context?: PatientContext,
    topN: number = 5
): Promise<CandidateRank[]> {
    if (!query || candidates.length === 0) return [];
    
    try {
        const provider = await ensureProvider();
        return await provider.rankCandidates(query, candidates, context, topN);
    } catch (err) {
        console.error('[AI Engine] Candidate ranking failed:', err);
        return [];
    }
}

/**
 * Suggest ICD-10 diagnosis codes for the given patient text.
 */
export async function suggestDiagnoses(
    text: string,
    topN = 5,
    minScore = 0.3
): Promise<AISuggestion[]> {
    if (!text || text.trim().length < 3) return [];

    try {
        const provider = await ensureProvider();
        return await provider.suggestDiagnoses(text, topN, minScore);
    } catch (err) {
        console.error('[AI Engine] Diagnosis query failed:', err);
        return [];
    }
}

/**
 * Suggest CPT investigation/procedure codes for the given text.
 */
export async function suggestInvestigations(
    text: string,
    topN = 5,
    minScore = 0.3
): Promise<AISuggestion[]> {
    if (!text || text.trim().length < 3) return [];

    try {
        const provider = await ensureProvider();
        return await provider.suggestInvestigations(text, topN, minScore);
    } catch (err) {
        console.error('[AI Engine] Investigation query failed:', err);
        return [];
    }
}
