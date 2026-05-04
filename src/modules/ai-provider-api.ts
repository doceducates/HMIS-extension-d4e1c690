import { AIProvider, AISuggestion, AIStatus, PatientContext, CandidateRank } from './ai-provider';
import { ExtensionConfig } from './types';

/**
 * API AI Provider — Stub for external API integrations (OpenAI, HuggingFace Inference, etc.)
 */
export class APIAIProvider implements AIProvider {
    readonly name = 'External API';
    private config: ExtensionConfig | null = null;

    constructor(config?: ExtensionConfig) {
        if (config) this.config = config;
    }

    async init(): Promise<void> {
        // In the future: validate API key, check endpoint health, etc.
        console.log('[APIAIProvider] Init called (stub)');
    }

    async getStatus(): Promise<AIStatus> {
        if (!this.config?.aiApiKey) return 'uninstalled';
        return 'ready';
    }

    async rankCandidates(
        query: string,
        candidates: string[],
        context?: PatientContext,
        topN: number = 5
    ): Promise<CandidateRank[]> {
        // Stub implementation
        console.warn('[APIAIProvider] rankCandidates is a stub');
        return [];
    }

    async suggestDiagnoses(
        text: string,
        topN = 5,
        minScore = 0.3
    ): Promise<AISuggestion[]> {
        // Stub implementation
        console.warn('[APIAIProvider] suggestDiagnoses is a stub');
        return [];
    }

    async suggestInvestigations(
        text: string,
        topN = 5,
        minScore = 0.3
    ): Promise<AISuggestion[]> {
        // Stub implementation
        console.warn('[APIAIProvider] suggestInvestigations is a stub');
        return [];
    }
}
