/**
 * Radiology Reporting & Workflow Service
 */
const path = require('path');
const fs = require('fs');
const sessionManager = require('../../core/session-manager');
const SELECTORS = require('../../config/selectors');
const env = require('../../config/env');
const { extractWorklistRecords, extractTrackingMilestones } = require('./radiology.scraper');
const { inferDateRangeFromAccession } = require('../../utils/date-helper');

class RadiologyService {
    constructor() {
        this.auditDir = path.join(__dirname, '../../../audit-logs');
        if (!fs.existsSync(this.auditDir)) {
            fs.mkdirSync(this.auditDir, { recursive: true });
        }
    }

    async getWorklist(credentials) {
        return await sessionManager.withSession(credentials, async (page) => {
            const url = `${env.PORTAL_URL}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
            await page.goto(url, { waitUntil: 'networkidle' });
            return await page.evaluate(extractWorklistRecords);
        });
    }

    async searchPatient(credentials, query = {}) {
        return await sessionManager.withSession(credentials, async (page) => {
            const { mrn, accession } = query;
            const url = `${env.PORTAL_URL}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
            await page.goto(url, { waitUntil: 'networkidle' });

            if (accession) {
                await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
                await page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
            } else if (mrn) {
                await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
                await page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
            }

            const searchBtn = await page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
            if (searchBtn) await searchBtn.click();
            else await page.keyboard.press('Enter');

            await page.waitForTimeout(1500);
            await page.waitForLoadState('networkidle');

            let records = await page.evaluate(extractWorklistRecords);

            // Auto Date Range Expansion if 0 records on 48h worklist
            if (records.length === 0 && (mrn || accession)) {
                const dateHint = inferDateRangeFromAccession(accession);
                if (dateHint) {
                    console.log(`💡 [RadiologyService] Inferred date range for ${accession}: ${dateHint.year}-${dateHint.month}`);
                    await this.setWorklistDateRange(page, dateHint.startDate, dateHint.endDate);

                    const sBtn = await page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
                    if (sBtn) await sBtn.click();
                    await page.waitForTimeout(1500);
                    await page.waitForLoadState('networkidle');

                    records = await page.evaluate(extractWorklistRecords);
                    if (records.length > 0) {
                        return { source: 'WORKLIST_DATE_RANGE', inferredDateRange: dateHint, count: records.length, records };
                    }
                }

                // Fallback to tracking list
                return await this.executeTrackSearch(page, query);
            }

            return { source: 'WORKLIST', count: records.length, records };
        });
    }

    async trackReport(credentials, query = {}) {
        return await sessionManager.withSession(credentials, async (page) => {
            return await this.executeTrackSearch(page, query);
        });
    }

    async executeTrackSearch(page, query) {
        const { mrn, accession } = query;
        const url = `${env.PORTAL_URL}${SELECTORS.RADIOLOGY.TRACKING_URL}`;
        await page.goto(url, { waitUntil: 'networkidle' });

        if (accession) {
            await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
            await page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
        } else if (mrn) {
            await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
            await page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
        }

        const searchBtn = await page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
        if (searchBtn) await searchBtn.click();
        else await page.keyboard.press('Enter');

        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle');

        const records = await page.evaluate(extractTrackingMilestones);
        return { source: 'TRACKING_LIST', count: records.length, records };
    }

    async setWorklistDateRange(page, start, end) {
        await page.evaluate(async ({ s, e }) => {
            const sel = document.querySelector('select[wire\\:model\\.defer="time_list"], select[name="time_list"]');
            if (sel && sel.value !== 'Date Range') {
                sel.value = 'Date Range';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                sel.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 1200));
            }
            const f = document.querySelector('#from-date-datetimepicker');
            const t = document.querySelector('#to-date-datetimepicker');
            if (f) f.value = s;
            if (t) t.value = e;
            if (window.livewire) window.livewire.emit('set-date-range', s, e);
        }, { s: start, e: end });
        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle');
    }

    async saveDraft(credentials, payload) {
        return await sessionManager.withSession(credentials, async (page) => {
            const { mrn, accession, moduleId, technique, findings, impression, clinicalHistory, pgrName, consultantName } = payload;
            if (!mrn) throw new Error('Missing patient MRN in radiology draft payload.');

            const worklistUrl = `${env.PORTAL_URL}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
            await page.goto(worklistUrl, { waitUntil: 'networkidle' });

            // Search
            if (accession) {
                await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
                await page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
            } else {
                await page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
                await page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
            }
            const sBtn = await page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
            if (sBtn) await sBtn.click();
            await page.waitForTimeout(1500);
            await page.waitForLoadState('networkidle');

            // Open Modal
            let addResultBtn = null;
            if (accession) addResultBtn = await page.$(`tr:has-text("${accession}") a[wire\\:click*="addSampleResult"]`);
            if (!addResultBtn) addResultBtn = await page.$(SELECTORS.RADIOLOGY.ADD_RESULT_BTN);
            if (!addResultBtn) throw new Error(`Add Result button not visible for MRN ${mrn} (Accession: ${accession || 'N/A'}).`);
            await addResultBtn.click();

            await page.waitForSelector(SELECTORS.RADIOLOGY.MODAL_CONTAINER, { state: 'visible', timeout: 15000 });

            // Module Selection
            if (moduleId) {
                await page.selectOption(SELECTORS.RADIOLOGY.MODULE_SELECT, moduleId.toString());
                await page.waitForTimeout(2000);
                await page.waitForLoadState('networkidle');
            } else {
                await this.autoMatchModule(page);
            }

            // Compose HTML
            const pgr = pgrName || 'Resident Radiologist (PGR)';
            const consultant = consultantName || 'Consultant Radiologist';
            let reportHtml = technique ? `<p><strong>TECHNIQUE:</strong><br>${technique}</p>` : '';
            reportHtml += `<p><strong>FINDINGS:</strong></p>${findings || 'No acute abnormality detected.'}`;
            reportHtml += `<br><p><strong>Reported By:</strong> ${pgr}<br><strong>Verified By:</strong> ${consultant}</p>`;
            const impressionHtml = `<p><strong>IMPRESSION:</strong></p>${impression || 'Study within normal limits.'}<br><p><strong>Attribution:</strong> ${pgr} | <strong>Verified:</strong> ${consultant}</p>`;

            // Inject into TinyMCE & Textareas
            await page.evaluate(({ rep, imp, hist }) => {
                if (window.tinymce && window.tinymce.editors) {
                    window.tinymce.editors.forEach(ed => {
                        const id = (ed.id || '').toLowerCase();
                        if (id.includes('report') && rep) { ed.setContent(rep); ed.save(); }
                        if (id.includes('impression') && imp) { ed.setContent(imp); ed.save(); }
                        if (id.includes('history') && hist) { ed.setContent(hist); ed.save(); }
                    });
                }
                const tas = document.querySelectorAll('#AddSampleResult textarea');
                tas.forEach(ta => {
                    const id = (ta.id || '').toLowerCase();
                    if (id.includes('report') && rep) { ta.value = rep.replace(/<[^>]+>/g, '\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
                    if (id.includes('impression') && imp) { ta.value = imp.replace(/<[^>]+>/g, '\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
                    if (id.includes('history') && hist) { ta.value = hist; ta.dispatchEvent(new Event('input', { bubbles: true })); }
                });
            }, { rep: reportHtml, imp: impressionHtml, hist: clinicalHistory });

            // Anti-wipe recheck
            await page.waitForTimeout(500);
            await page.evaluate(({ rep, imp }) => {
                if (window.tinymce && window.tinymce.editors) {
                    window.tinymce.editors.forEach(ed => {
                        const id = (ed.id || '').toLowerCase();
                        if (id.includes('report') && rep) { ed.setContent(rep); ed.save(); }
                        if (id.includes('impression') && imp) { ed.setContent(imp); ed.save(); }
                    });
                }
            }, { rep: reportHtml, imp: impressionHtml });

            // Save Draft (STRICT LOCK: NEVER SUBMIT)
            const saveBtn = await page.$(SELECTORS.RADIOLOGY.SAVE_DRAFT_BTN);
            if (!saveBtn) throw new Error('Save Draft button [wire:click="save(\'save\')"] not found in modal.');
            await saveBtn.click();
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle');

            // Screenshot Audit
            const filename = `draft-${mrn}-${Date.now()}.png`;
            await page.screenshot({ path: path.join(this.auditDir, filename), fullPage: false });

            return {
                mrn,
                accession,
                status: 'DRAFT_SAVED',
                auditScreenshot: filename,
                savedAt: new Date().toISOString()
            };
        });
    }

    async autoMatchModule(page) {
        return await page.evaluate(() => {
            const modal = document.querySelector('#AddSampleResult');
            const select = document.querySelector('#changeModule');
            if (!modal || !select || !select.options) return false;
            const tds = Array.from(modal.querySelectorAll('td'));
            let cptText = '';
            for (let i = 0; i < tds.length; i++) {
                if (tds[i].innerText.trim() === 'CPT' && tds[i + 1]) {
                    cptText = tds[i + 1].innerText.trim().replace(/\s*-\s*\d+$/, '').toUpperCase();
                    break;
                }
            }
            if (!cptText) return false;
            const options = Array.from(select.options).filter(o => o.value);
            let matched = options.find(o => cptText.includes(o.text.toUpperCase()) || o.text.toUpperCase().includes(cptText));
            if (!matched) {
                const tokens = cptText.replace(/WITHOUT CONTRAST|WITH CONTRAST|CONTRAST|PROTOCOL|SCAN/gi, '').split(/\s+/).filter(t => t.length > 2);
                matched = options.find(o => tokens.some(tok => o.text.toUpperCase().includes(tok)));
            }
            if (matched) {
                select.value = matched.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
                return matched.value;
            }
            return false;
        });
    }
}

module.exports = new RadiologyService();
