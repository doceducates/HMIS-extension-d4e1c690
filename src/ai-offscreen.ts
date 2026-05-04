/**
 * AI Offscreen Document — Runs the embedding model in a hidden browser context.
 *
 * This script is loaded by ai-offscreen.html, which is created as a Chrome
 * offscreen document. It loads the all-MiniLM-L6-v2 model via Transformers.js,
 * pre-computes embeddings for all known ICD-10/CPT codes, and handles
 * inference requests from the background service worker.
 *
 * Communication: background.ts → (chrome.runtime.sendMessage) → this file
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import icd10Codes from './data/icd10-codes.json';
import cptCodes from './data/cpt-codes.json';

// ════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════════════════════

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DB_NAME = 'hmis-ai-embeddings';
const DB_VERSION = 2;
const ICD10_STORE = 'icd10';
const CPT_STORE = 'cpt';

// Configure Transformers.js for extension context
env.allowLocalModels = false;
env.useBrowserCache = true;

// Point to local WASM files bundled by Vite
// Since we're in an extension, absolute paths starting with / refer to the extension root
if (env.backends?.onnx?.wasm) {
    (env.backends.onnx.wasm as any).wasmPaths = '/assets/wasm/';
}

// ════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════

interface CodeEntry {
    code: string;
    label: string;
}

interface EmbeddedEntry {
    code: string;
    label: string;
    embedding: number[];
}

interface AISuggestion {
    code: string;
    label: string;
    score: number;
}

type AIStatus = 'loading' | 'ready' | 'error' | 'disabled' | 'uninstalled' | 'downloading';

// ════════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════════

let embedder: FeatureExtractionPipeline | null = null;
let icd10Index: EmbeddedEntry[] = [];
let cptIndex: EmbeddedEntry[] = [];
let status: AIStatus = 'loading';
let initPromise: Promise<void> | null = null;

// ════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ════════════════════════════════════════════════════════════════

async function initialize(): Promise<void> {
    try {
        status = 'loading';
        console.log('[AI] Loading embedding model:', MODEL_NAME);

        // Load the model
        embedder = await pipeline('feature-extraction', MODEL_NAME, {
            dtype: 'q8',  // INT8 quantization — ~22MB
            progress_callback: (progress: any) => {
                if (progress.status === 'progress') {
                    const percent = Math.round(progress.loaded / progress.total * 100);
                    chrome.runtime.sendMessage({
                        type: 'AI_PROGRESS',
                        payload: { percent, status: 'downloading' }
                    });
                }
            }
        }) as FeatureExtractionPipeline;

        console.log('[AI] Model loaded successfully');

        // Try to load cached embeddings from IndexedDB
        const cached = await loadCachedEmbeddings();

        if (cached) {
            icd10Index = cached.icd10;
            cptIndex = cached.cpt;
            console.log(`[AI] Loaded ${icd10Index.length} ICD-10 + ${cptIndex.length} CPT embeddings from cache`);
        } else {
            // Compute embeddings from scratch
            console.log('[AI] Computing embeddings for ICD-10 codes...');
            icd10Index = await computeEmbeddings(icd10Codes as CodeEntry[]);
            console.log('[AI] Computing embeddings for CPT codes...');
            cptIndex = await computeEmbeddings(cptCodes as CodeEntry[]);
            console.log(`[AI] Computed ${icd10Index.length} ICD-10 + ${cptIndex.length} CPT embeddings`);

            // Cache for next time
            await saveCachedEmbeddings(icd10Index, cptIndex);
            console.log('[AI] Embeddings cached to IndexedDB');
        }

        status = 'ready';
        console.log('[AI] AI engine ready');
    } catch (err) {
        console.error('[AI] Initialization failed:', err);
        status = 'error';
        throw err;
    }
}

/**
 * Compute embeddings for a list of code entries.
 * Processes in batches to avoid memory pressure.
 */
async function computeEmbeddings(entries: CodeEntry[]): Promise<EmbeddedEntry[]> {
    if (!embedder) throw new Error('Model not loaded');

    const results: EmbeddedEntry[] = [];
    const BATCH_SIZE = 16;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const texts = batch.map(e => e.label);

        const output = await embedder(texts, { pooling: 'mean', normalize: true });
        const data = output.data as Float32Array;
        const dim = output.dims[1];

        for (let j = 0; j < batch.length; j++) {
            results.push({
                code: batch[j].code,
                label: batch[j].label,
                embedding: Array.from(data.slice(j * dim, (j + 1) * dim)),
            });
        }
    }

    return results;
}

// ════════════════════════════════════════════════════════════════
//  INFERENCE
// ════════════════════════════════════════════════════════════════

/**
 * Embed a query text and find the top-N most similar entries.
 */
async function findSimilar(
    query: string,
    index: EmbeddedEntry[],
    topN = 5,
    minScore = 0.3
): Promise<AISuggestion[]> {
    if (!embedder || index.length === 0) return [];

    // Embed the query
    const output = await embedder(query, { pooling: 'mean', normalize: true });
    const queryEmb = Array.from(output.data as Float32Array);

    // Score all entries
    const scored = index.map(entry => ({
        code: entry.code,
        label: entry.label,
        score: cosineSimilarity(queryEmb, entry.embedding),
    }));

    // Sort by score, filter by minimum, return top-N
    return scored
        .filter(s => s.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

// ════════════════════════════════════════════════════════════════
//  INDEXEDDB CACHE
// ════════════════════════════════════════════════════════════════

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(ICD10_STORE)) {
                db.createObjectStore(ICD10_STORE, { keyPath: 'code' });
            }
            if (!db.objectStoreNames.contains(CPT_STORE)) {
                db.createObjectStore(CPT_STORE, { keyPath: 'code' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadCachedEmbeddings(): Promise<{ icd10: EmbeddedEntry[]; cpt: EmbeddedEntry[] } | null> {
    try {
        const db = await openDB();

        const loadStore = (storeName: string): Promise<EmbeddedEntry[]> => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        };

        const icd10 = await loadStore(ICD10_STORE);
        const cpt = await loadStore(CPT_STORE);

        // Validate cache — if sizes don't match source data, recompute
        if (icd10.length !== (icd10Codes as CodeEntry[]).length || cpt.length !== (cptCodes as CodeEntry[]).length) {
            console.log('[AI] Cache size mismatch — will recompute');
            return null;
        }

        // Check that embeddings actually exist
        if (icd10.length > 0 && (!icd10[0].embedding || icd10[0].embedding.length === 0)) {
            console.log('[AI] Cache entries missing embeddings — will recompute');
            return null;
        }

        return { icd10, cpt };
    } catch (err) {
        console.warn('[AI] Failed to load cache:', err);
        return null;
    }
}

async function saveCachedEmbeddings(icd10: EmbeddedEntry[], cpt: EmbeddedEntry[]): Promise<void> {
    try {
        const db = await openDB();

        const saveStore = (storeName: string, entries: EmbeddedEntry[]): Promise<void> => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                store.clear();
                for (const entry of entries) {
                    store.put(entry);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        };

        await saveStore(ICD10_STORE, icd10);
        await saveStore(CPT_STORE, cpt);
    } catch (err) {
        console.warn('[AI] Failed to save cache:', err);
    }
}

// ════════════════════════════════════════════════════════════════
//  MESSAGE HANDLING
// ════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'ai-offscreen') return false;

    switch (message.type) {
        case 'AI_STATUS':
            sendResponse({ status });
            return false;

        case 'AI_INIT':
            if (!initPromise) {
                initPromise = initialize();
            }
            initPromise
                .then(() => sendResponse({ status: 'ready' }))
                .catch(err => sendResponse({ status: 'error', error: err.message }));
            return true; // async

        case 'AI_QUERY_DIAGNOSIS':
            handleQuery(message.payload.text, icd10Index, message.payload.topN, message.payload.minScore)
                .then(results => sendResponse({ results }))
                .catch(err => sendResponse({ error: err.message, results: [] }));
            return true; // async

        case 'AI_QUERY_INVESTIGATION':
            handleQuery(message.payload.text, cptIndex, message.payload.topN, message.payload.minScore)
                .then(results => sendResponse({ results }))
                .catch(err => sendResponse({ error: err.message, results: [] }));
            return true; // async

        case 'AI_RANK_CANDIDATES':
            handleRankCandidates(message.payload)
                .then(results => sendResponse({ results }))
                .catch(err => sendResponse({ error: err.message, results: [] }));
            return true;

        default:
            return false;
    }
});

function buildEnrichedQuery(query: string, context?: any): string {
    if (!context) return query;
    
    const parts = [query];
    if (context.existingDiagnoses?.length > 0) {
        parts.push(`Diagnosis: ${context.existingDiagnoses.join(', ')}`);
    }
    if (context.complaints?.length > 0) {
        parts.push(`Complaints: ${context.complaints.join(', ')}`);
    }
    if (context.demographics?.gender) {
        parts.push(`Patient: ${context.demographics.gender}, ${context.demographics.age}`);
    }
    return parts.join(' | ');
}

async function handleRankCandidates(payload: { query: string, candidates: string[], context?: any, topN?: number }) {
    if (status !== 'ready') {
        if (!initPromise) initPromise = initialize();
        await initPromise;
    }
    if (!embedder) return [];

    const enrichedQuery = buildEnrichedQuery(payload.query, payload.context);
    console.log(`[AI] Ranking ${payload.candidates.length} candidates for: "${enrichedQuery}"`);

    // Embed the enriched query
    const queryOutput = await embedder(enrichedQuery, { pooling: 'mean', normalize: true });
    const queryEmb = Array.from(queryOutput.data as Float32Array);

    // Embed all candidates
    const scoredCandidates = [];
    for (let i = 0; i < payload.candidates.length; i++) {
        const candidateLabel = payload.candidates[i];
        const candOutput = await embedder(candidateLabel, { pooling: 'mean', normalize: true });
        const candEmb = Array.from(candOutput.data as Float32Array);
        
        const score = cosineSimilarity(queryEmb, candEmb);
        scoredCandidates.push({ index: i, label: candidateLabel, score });
    }

    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates.slice(0, payload.topN || 5);
}

async function handleQuery(
    text: string,
    index: EmbeddedEntry[],
    topN?: number,
    minScore?: number
): Promise<AISuggestion[]> {
    // Ensure initialized
    if (status !== 'ready') {
        if (!initPromise) {
            initPromise = initialize();
        }
        await initPromise;
    }

    return findSimilar(text, index, topN || 5, minScore || 0.3);
}

// Auto-init when the offscreen document loads
console.log('[AI] Offscreen document loaded — waiting for AI_INIT message');
