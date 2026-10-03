/**
 * HMIS Local API Gateway (HTTP & WebSocket Server)
 * 
 * Runs locally on your workstation to bridge REST API requests / WebSocket clients
 * with the HMIS Autopilot Chrome Extension.
 * 
 * Run with: node gateway-server.js
 */

import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.GATEWAY_PORT || 8080;

// Track active WebSocket connections
let extensionSocket = null;
const activeRequests = new Map(); // Map command IDs to response orchestrators

// Create the standard HTTP Server
const server = http.createServer((req, res) => {
    // Enable CORS for easy cross-origin querying
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight options request
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Standard JSON response utility
    const sendJSON = (statusCode, payload) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    };

    // Health / Status endpoint
    if (req.url === '/api/status' && req.method === 'GET') {
        sendJSON(200, {
            status: 'online',
            extensionConnected: !!extensionSocket,
            activePendingRequests: activeRequests.size
        });
        return;
    }

    // Guard: Check if the extension is connected before processing portal operations
    if (!extensionSocket) {
        sendJSON(503, {
            status: 'error',
            error: 'HMIS Chrome Extension is not connected. Make sure Chrome is open on hmis.punjab.gov.pk.'
        });
        return;
    }

    // Parse URL endpoints and handle API routing
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // Helper to extract JSON body from incoming POST request
    const getRequestBody = () => {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (err) {
                    reject(new Error('Invalid JSON body'));
                }
            });
        });
    };

    /**
     * 1. GET /api/patient/queue - Scrapes and returns current patient queue
     */
    if (pathname === '/api/patient/queue' && req.method === 'GET') {
        const messageId = Math.random().toString(36).substring(2, 9);
        
        activeRequests.set(messageId, {
            res,
            timeout: setTimeout(() => {
                if (activeRequests.has(messageId)) {
                    activeRequests.delete(messageId);
                    sendJSON(504, { status: 'error', error: 'Request timed out waiting for extension response.' });
                }
            }, 10000) // 10s timeout
        });

        extensionSocket.send(JSON.stringify({
            id: messageId,
            action: 'GET_PATIENT_QUEUE'
        }));
        return;
    }

    /**
     * 2. POST /api/user/role - Automates switching to a specific role ID
     */
    if (pathname === '/api/user/role' && req.method === 'POST') {
        getRequestBody()
            .then(body => {
                const { roleId } = body;
                if (!roleId) {
                    return sendJSON(400, { status: 'error', error: 'Missing roleId in request body.' });
                }

                const messageId = Math.random().toString(36).substring(2, 9);

                activeRequests.set(messageId, {
                    res,
                    timeout: setTimeout(() => {
                        if (activeRequests.has(messageId)) {
                            activeRequests.delete(messageId);
                            sendJSON(504, { status: 'error', error: 'Request timed out.' });
                        }
                    }, 8000)
                });

                extensionSocket.send(JSON.stringify({
                    id: messageId,
                    action: 'SWITCH_USER_ROLE',
                    payload: { roleId }
                }));
            })
            .catch(err => sendJSON(400, { status: 'error', error: err.message }));
        return;
    }

    /**
     * 3. POST /api/patient/process - Automates clinical processing for a patient token
     */
    if (pathname === '/api/patient/process' && req.method === 'POST') {
        getRequestBody()
            .then(body => {
                const { patientId, mode } = body;
                if (!patientId) {
                    return sendJSON(400, { status: 'error', error: 'Missing patientId in request body.' });
                }

                const messageId = Math.random().toString(36).substring(2, 9);

                activeRequests.set(messageId, {
                    res,
                    timeout: setTimeout(() => {
                        if (activeRequests.has(messageId)) {
                            activeRequests.delete(messageId);
                            sendJSON(504, { status: 'error', error: 'Form automation timed out.' });
                        }
                    }, 45000) // Form filling has a higher timeout limit (45s)
                });

                extensionSocket.send(JSON.stringify({
                    id: messageId,
                    action: 'PROCESS_PATIENT',
                    payload: { patientId, mode: mode || 'auto' }
                }));
            })
            .catch(err => sendJSON(400, { status: 'error', error: err.message }));
        return;
    }

    /**
     * 4. POST /api/workflow/start - Starts general queue autopilot scan
     */
    if (pathname === '/api/workflow/start' && req.method === 'POST') {
        extensionSocket.send(JSON.stringify({
            id: 'start-workflow-signal',
            action: 'START_AUTOPILOT'
        }));
        sendJSON(200, { status: 'success', message: 'Autopilot scan triggered.' });
        return;
    }

    /**
     * 5. POST /api/workflow/stop - Instantly pauses queue autopilot scan
     */
    if (pathname === '/api/workflow/stop' && req.method === 'POST') {
        extensionSocket.send(JSON.stringify({
            id: 'stop-workflow-signal',
            action: 'STOP_AUTOPILOT'
        }));
        sendJSON(200, { status: 'success', message: 'Autopilot scan stopped.' });
        return;
    }

    /**
     * 6. POST /api/radiology/report - Dispatches a structured radiology report to the extension for autofill
     */
    if (pathname === '/api/radiology/report' && req.method === 'POST') {
        getRequestBody()
            .then(body => {
                const { patientMrn, accessionNumber } = body;
                if (!patientMrn && !accessionNumber) {
                    return sendJSON(400, { status: 'error', error: 'Missing patientMrn or accessionNumber in report payload.' });
                }

                const messageId = Math.random().toString(36).substring(2, 9);

                activeRequests.set(messageId, {
                    res,
                    timeout: setTimeout(() => {
                        if (activeRequests.has(messageId)) {
                            activeRequests.delete(messageId);
                            sendJSON(504, { status: 'error', error: 'Radiology report autofill timed out waiting for extension response.' });
                        }
                    }, 45000)
                });

                extensionSocket.send(JSON.stringify({
                    id: messageId,
                    action: 'FILL_RADIOLOGY_REPORT',
                    payload: body
                }));
            })
            .catch(err => sendJSON(400, { status: 'error', error: err.message }));
        return;
    }

    /**
     * 7. GET /api/radiology/current-investigation - Queries current patient/investigation details from HMIS
     */
    if (pathname === '/api/radiology/current-investigation' && req.method === 'GET') {
        const messageId = Math.random().toString(36).substring(2, 9);
        activeRequests.set(messageId, {
            res,
            timeout: setTimeout(() => {
                if (activeRequests.has(messageId)) {
                    activeRequests.delete(messageId);
                    sendJSON(504, { status: 'error', error: 'Timed out waiting for HMIS investigation details.' });
                }
            }, 8000)
        });

        extensionSocket.send(JSON.stringify({
            id: messageId,
            action: 'GET_CURRENT_INVESTIGATION'
        }));
        return;
    }

    /**
     * 8. GET /api/radiology/patient-history - Fetches prior pathology and imaging reports
     */
    if (pathname === '/api/radiology/patient-history' && req.method === 'GET') {
        const investigationId = parsedUrl.searchParams.get('investigationId') || '';
        const messageId = Math.random().toString(36).substring(2, 9);
        activeRequests.set(messageId, {
            res,
            timeout: setTimeout(() => {
                if (activeRequests.has(messageId)) {
                    activeRequests.delete(messageId);
                    sendJSON(504, { status: 'error', error: 'Timed out fetching patient history.' });
                }
            }, 12000)
        });

        extensionSocket.send(JSON.stringify({
            id: messageId,
            action: 'GET_PATIENT_HISTORY',
            payload: { investigationId }
        }));
        return;
    }

    /**
     * 9. POST /api/radiology/submit-result - Submits / saves radiology report into HMIS
     */
    if (pathname === '/api/radiology/submit-result' && req.method === 'POST') {
        getRequestBody()
            .then(body => {
                const messageId = Math.random().toString(36).substring(2, 9);
                activeRequests.set(messageId, {
                    res,
                    timeout: setTimeout(() => {
                        if (activeRequests.has(messageId)) {
                            activeRequests.delete(messageId);
                            sendJSON(504, { status: 'error', error: 'Result submission timed out.' });
                        }
                    }, 45000)
                });

                extensionSocket.send(JSON.stringify({
                    id: messageId,
                    action: 'SUBMIT_RADIOLOGY_RESULT',
                    payload: body
                }));
            })
            .catch(err => sendJSON(400, { status: 'error', error: err.message }));
        return;
    }

    /**
     * 10. POST /api/radiology/action - Triggers specific HMIS actions (pacs, reject, etc.)
     */
    if (pathname === '/api/radiology/action' && req.method === 'POST') {
        getRequestBody()
            .then(body => {
                const messageId = Math.random().toString(36).substring(2, 9);
                activeRequests.set(messageId, {
                    res,
                    timeout: setTimeout(() => {
                        if (activeRequests.has(messageId)) {
                            activeRequests.delete(messageId);
                            sendJSON(504, { status: 'error', error: 'Action execution timed out.' });
                        }
                    }, 10000)
                });

                extensionSocket.send(JSON.stringify({
                    id: messageId,
                    action: 'EXECUTE_HMIS_ACTION',
                    payload: body
                }));
            })
            .catch(err => sendJSON(400, { status: 'error', error: err.message }));
        return;
    }

    // Default 404 endpoint handler
    sendJSON(404, { status: 'error', error: 'API endpoint not found.' });
});

// Create the WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
    const isExtension = request.url.includes('client=extension');

    if (isExtension) {
        extensionSocket = ws;
        console.log('🔌 [HMIS Extension] WebSocket Connection established.');

        ws.on('message', (message) => {
            try {
                const response = JSON.parse(message.toString());
                const { id, error, data } = response;

                // Resolve the pending REST API response matching the incoming message ID
                if (id && activeRequests.has(id)) {
                    const reqObj = activeRequests.get(id);
                    clearTimeout(reqObj.timeout);
                    
                    if (error) {
                        reqObj.res.writeHead(500, { 'Content-Type': 'application/json' });
                        reqObj.res.end(JSON.stringify({ status: 'error', error }));
                    } else {
                        reqObj.res.writeHead(200, { 'Content-Type': 'application/json' });
                        reqObj.res.end(JSON.stringify({ status: 'success', data }));
                    }

                    activeRequests.delete(id);
                }
            } catch (err) {
                console.error('[Error] Parsing message from extension:', err);
            }
        });

        ws.on('close', () => {
            console.log('❌ [HMIS Extension] WebSocket Connection closed.');
            extensionSocket = null;
        });

        ws.on('error', (err) => {
            console.error('[Error] Extension WebSocket error:', err.message);
            extensionSocket = null;
        });
    } else {
        // Handle generic secondary WebSocket API clients
        console.log('🤖 [WS Client] External API Client attached.');
        
        ws.on('message', (message) => {
            try {
                const payload = JSON.parse(message.toString());
                
                if (!extensionSocket) {
                    ws.send(JSON.stringify({ status: 'error', error: 'HMIS Extension is offline.' }));
                    return;
                }

                // Pass the raw request directly to the browser extension
                extensionSocket.send(JSON.stringify(payload));
                console.log(`✉️ Relayed WebSocket command: ${payload.action}`);
            } catch (err) {
                ws.send(JSON.stringify({ status: 'error', error: 'Invalid JSON socket request payload.' }));
            }
        });
    }
});

// Bind WebSocket protocol upgrade handling to the HTTP server
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Start listening for traffic
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 HMIS Local Gateway active on: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket service active on: ws://localhost:${PORT}`);
    console.log(`====================================================`);
});
