/**
 * HMIS Portal Data Extraction Verification Script
 *
 * Tests retrieving live patient details, MRN, investigation ID,
 * active module, and prior pathology reports from HMIS via the local Gateway.
 *
 * Run with: node scripts/test-hmis-extract.js
 */

import http from 'http';

const GATEWAY_HOST = 'localhost';
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8080;

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: GATEWAY_HOST,
        port: GATEWAY_PORT,
        path: path,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function main() {
  console.log('====================================================');
  console.log('🔍 Testing HMIS Portal Data Extraction via Gateway');
  console.log(`📡 Target Gateway: http://${GATEWAY_HOST}:${GATEWAY_PORT}`);
  console.log('====================================================\n');

  // 1. Check Gateway Status
  try {
    const statusRes = await fetchJson('/api/status');
    console.log('1️⃣ Gateway Status:', statusRes.data);
    if (!statusRes.data?.extensionConnected) {
      console.warn('⚠️ HMIS Extension is not currently connected to the gateway.');
      console.log('👉 Please ensure Chrome is open with the HMIS extension loaded on hmis.punjab.gov.pk.');
      return;
    }
  } catch (err) {
    console.error('❌ Cannot connect to local gateway on port ' + GATEWAY_PORT + ':', err.message);
    console.log('👉 Please start the gateway server: node gateway-server.js');
    return;
  }

  // 2. Query Current Active Investigation
  console.log('\n2️⃣ Querying Active Radiology Investigation...');
  try {
    const invRes = await fetchJson('/api/radiology/current-investigation');
    console.log('📊 Investigation Result:', JSON.stringify(invRes.data, null, 2));

    const inv = invRes.data?.data;
    if (inv) {
      console.log('\n✅ Successfully extracted patient investigation:');
      console.log(`   • Patient Name:      ${inv.patientName || '(none)'}`);
      console.log(`   • MR Number:        ${inv.mrn || '(none)'}`);
      console.log(`   • Investigation ID: ${inv.investigationId || '(none)'}`);
      console.log(`   • Study/Accession:  ${inv.studyId || '(none)'}`);
      console.log(`   • Active Module:    ${inv.moduleName || '(none)'} (ID: ${inv.moduleId || 'none'})`);
      console.log(`   • Age / Gender:     ${inv.age || ''} / ${inv.gender || ''}`);
      console.log(`   • Modal Open:       ${inv.isModalOpen}`);

      // 3. Query Patient History & Pathology if investigationId is present
      if (inv.investigationId) {
        console.log(`\n3️⃣ Querying Prior Pathology & Imaging History for ID: ${inv.investigationId}...`);
        const histRes = await fetchJson(`/api/radiology/patient-history?investigationId=${inv.investigationId}`);
        console.log('🔬 History Results:', JSON.stringify(histRes.data, null, 2));
      }
    } else {
      console.log('ℹ️ No active radiology investigation modal detected on the current HMIS tab.');
      console.log('👉 Open an "Add Result" modal on hmis.punjab.gov.pk and run this script again.');
    }
  } catch (err) {
    console.error('❌ Error extracting investigation details:', err.message);
  }
}

main();
