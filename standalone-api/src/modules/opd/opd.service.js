/**
 * OPD Module Service
 */
const sessionManager = require('../../core/session-manager');
const SELECTORS = require('../../config/selectors');
const env = require('../../config/env');

class OpdService {
    async getQueue(credentials) {
        return await sessionManager.withSession(credentials, async (page) => {
            if (!page.url().includes('/today') && !page.url().includes('/token')) {
                await page.goto(`${env.PORTAL_URL}/today`, { waitUntil: 'networkidle' });
            }
            return await page.evaluate(() => {
                const rows = document.querySelectorAll('.right_col table tbody tr');
                const list = [];
                rows.forEach(r => {
                    const cols = r.querySelectorAll('td');
                    if (cols.length >= 4) {
                        list.push({
                            token: cols[0]?.textContent?.trim() || '',
                            mrn: cols[1]?.textContent?.trim() || '',
                            name: cols[2]?.textContent?.trim() || '',
                            ageGender: cols[3]?.textContent?.trim() || '',
                            status: cols[4]?.textContent?.trim() || ''
                        });
                    }
                });
                return list;
            });
        });
    }

    async processPatientToken(credentials, patientId) {
        return await sessionManager.withSession(credentials, async (page) => {
            const btn = await page.$(`a#tokenPatButton_${patientId}, a#tokenArrowButton_${patientId}`);
            if (btn) {
                await btn.click();
                await page.waitForTimeout(1500);
                return { patientId, processed: true };
            }
            throw new Error(`Token button for patient ID ${patientId} not found.`);
        });
    }
}

module.exports = new OpdService();
