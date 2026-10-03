/**
 * Live Search Test Script for Accession Number 192609005762
 * Usage: node test-search-live.js [accession]
 */

const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const TARGET_ACCESSION = process.argv[2] || '192609005762';
const CLI_USERNAME = process.argv[3] || process.env.PORTAL_USERNAME;
const CLI_PASSWORD = process.argv[4] || process.env.PORTAL_PASSWORD;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

console.log('====================================================');
console.log('🔍 HMIS Accession Search Test');
console.log(`🎯 Target Accession: ${TARGET_ACCESSION}`);
console.log(`🌐 Gateway Endpoint: ${GATEWAY_URL}/api/radiology/patient?accession=${TARGET_ACCESSION}`);
if (CLI_USERNAME) console.log(`👤 Custom Credentials Provided for: ${CLI_USERNAME}`);
console.log('====================================================');

// 1. Try querying via HTTP API if gateway is already running
const req = http.get(`${GATEWAY_URL}/api/radiology/patient?accession=${TARGET_ACCESSION}`, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
        try {
            const data = JSON.parse(raw);
            console.log('✅ Response Received from Standalone API Gateway:');
            console.log(JSON.stringify(data, null, 2));
        } catch (e) {
            console.log('Raw Response:', raw);
        }
    });
});

req.on('error', async (err) => {
    console.log(`⚠️ Standalone API server not running at ${GATEWAY_URL} (${err.message}).`);
    console.log('🚀 Running direct in-process Playwright provider search instead...');

    const PortalProvider = require('./provider');
    const provider = new PortalProvider();
    try {
        const creds = (CLI_USERNAME && CLI_PASSWORD) ? { username: CLI_USERNAME, password: CLI_PASSWORD } : null;
        console.log('🔑 Initializing browser session...');
        await provider.ensureSession(creds);
        console.log(`🔎 Executing searchPatient({ accession: "${TARGET_ACCESSION}" })...`);
        const result = await provider.searchPatient({ accession: TARGET_ACCESSION });
        console.log('🎉 DIRECT SEARCH RESULT:');
        console.log(JSON.stringify(result, null, 2));
        await provider.close();
    } catch (searchErr) {
        console.error('❌ Direct search error:', searchErr.message);
        await provider.close();
    }
});
