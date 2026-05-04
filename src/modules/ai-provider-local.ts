import { AIProvider, AISuggestion, AIStatus, PatientContext, CandidateRank } from './ai-provider';

/**
 * Send a message to the background service worker, which relays
 * it to the AI offscreen document.
 */
function sendToBackground(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Local AI Provider — Uses Transformers.js running in an offscreen document.
 */
export class LocalAIProvider implements AIProvider {
    readonly name = 'Local Transformers.js';

    async init(): Promise<void> {
        try {
            await sendToBackground({
                type: 'AI_INIT',
            });
        } catch (err) {
            console.error('[LocalAIProvider] Init failed:', err);
            throw err;
        }
    }

    async getStatus(): Promise<AIStatus> {
        try {
            const response = await sendToBackground({
                type: 'AI_STATUS',
            });
            const status = response?.status || 'disabled';

            if (status === 'disabled' || status === 'loading' || status === 'error') {
                const storage = await chrome.storage.local.get('aiModelDownloaded');
                if (!storage.aiModelDownloaded) {
                    return 'uninstalled';
                }
            }

            return status;
        } catch {
            const storage = await chrome.storage.local.get('aiModelDownloaded');
            return storage.aiModelDownloaded ? 'disabled' : 'uninstalled';
        }
    }

    async rankCandidates(
        query: string,
        candidates: string[],
        context?: PatientContext,
        topN: number = 5
    ): Promise<CandidateRank[]> {
        if (!query || candidates.length === 0) return [];

        try {
            const response = await sendToBackground({
                type: 'AI_RANK_CANDIDATES',
                payload: { query, candidates, context, topN },
            });
            return response?.results || [];
        } catch (err) {
            console.error('[LocalAIProvider] Candidate ranking failed:', err);
            return [];
        }
    }

    async suggestDiagnoses(
        text: string,
        topN = 5,
        minScore = 0.3
    ): Promise<AISuggestion[]> {
        if (!text || text.trim().length < 3) return [];

        try {
            const response = await sendToBackground({
                type: 'AI_QUERY_DIAGNOSIS',
                payload: { text: text.trim(), topN, minScore },
            });
            return response?.results || [];
        } catch (err) {
            console.error('[LocalAIProvider] Diagnosis query failed:', err);
            return [];
        }
    }

    async suggestInvestigations(
        text: string,
        topN = 5,
        minScore = 0.3
    ): Promise<AISuggestion[]> {
        if (!text || text.trim().length < 3) return [];

        try {
            const response = await sendToBackground({
                type: 'AI_QUERY_INVESTIGATION',
                payload: { text: text.trim(), topN, minScore },
            });
            return response?.results || [];
        } catch (err) {
            console.error('[LocalAIProvider] Investigation query failed:', err);
            return [];
        }
    }
}
