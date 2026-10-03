/**
 * Server Bootstrap Entrypoint (HTTP & WebSocket)
 */
const http = require('http');
const { WebSocketServer } = require('ws');
const app = require('./app');
const env = require('./config/env');
const sessionManager = require('./core/session-manager');
const radiologyService = require('./modules/radiology/radiology.service');
const opdService = require('./modules/opd/opd.service');

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
    console.log('🔌 [WebSocket] Client connected.');
    ws.send(JSON.stringify({ event: 'welcome', status: 'online', safetyMode: 'STRICT_DRAFT_ONLY' }));

    ws.on('message', async (message) => {
        try {
            const request = JSON.parse(message.toString());
            const { id, action, payload, credentials } = request;
            const creds = credentials || {};
            let result = null;

            switch (action) {
                case 'SEARCH_PATIENT':
                    result = await radiologyService.searchPatient(creds, payload);
                    ws.send(JSON.stringify({ id, status: 'success', data: result }));
                    break;
                case 'TRACK_REPORT':
                    result = await radiologyService.trackReport(creds, payload);
                    ws.send(JSON.stringify({ id, status: 'success', data: result }));
                    break;
                case 'SAVE_RADIOLOGY_DRAFT':
                    result = await radiologyService.saveDraft(creds, payload);
                    ws.send(JSON.stringify({ id, status: 'success', data: result }));
                    break;
                case 'GET_RADIOLOGY_QUEUE':
                    result = await radiologyService.getWorklist(creds);
                    ws.send(JSON.stringify({ id, status: 'success', data: result }));
                    break;
                case 'GET_PATIENT_QUEUE':
                    result = await opdService.getQueue(creds);
                    ws.send(JSON.stringify({ id, status: 'success', data: result }));
                    break;
                default:
                    ws.send(JSON.stringify({ id, error: `Action '${action}' unsupported.` }));
            }
        } catch (err) {
            ws.send(JSON.stringify({ error: err.message }));
        }
    });
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(env.PORT, () => {
    console.log('====================================================');
    console.log(`📡 HMIS REST API Microservice: http://localhost:${env.PORT}`);
    console.log(`📖 Interactive Swagger UI Docs: http://localhost:${env.PORT}/api/docs`);
    console.log(`⚡ WebSocket Stream:           ws://localhost:${env.PORT}`);
    console.log(`🔒 SAFETY MODE: STRICT DRAFT ONLY (Submit Locked)`);
    console.log('====================================================');
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down server and closing browser contexts...');
    await sessionManager.closeAll();
    process.exit(0);
});

module.exports = server;
