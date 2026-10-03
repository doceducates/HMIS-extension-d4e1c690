/**
 * Headless Browser Driver (Playwright)
 * 
 * Automates login, role-selection, queue scraping, and full radiology draft reporting
 * on hmis.punjab.gov.pk headlessly in the background.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SELECTORS = require('./selectors');
const { extractWorklistRecords, extractTrackingMilestones, inferDateRangeFromAccession } = require('./radiology-scraper');

class PortalProvider {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
        this.currentCredentials = null;
        this.portalUrl = process.env.PORTAL_URL || 'https://hmis.punjab.gov.pk';
        this.auditDir = path.join(__dirname, 'audit-logs');
        if (!fs.existsSync(this.auditDir)) {
            fs.mkdirSync(this.auditDir, { recursive: true });
        }
    }

    /**
     * Start the browser instance and perform login + hospital setup
     */
    async initialize(credentials = null) {
        if (!this.browser) {
            const headless = process.env.HEADLESS_MODE !== 'false';
            console.log(`🚀 Launching Playwright Chromium (Headless: ${headless})...`);

            try {
                this.browser = await chromium.launch({
                    headless: headless,
                    channel: 'chrome',
                    args: ['--disable-dev-shm-usage', '--no-sandbox']
                });
            } catch (launchErr) {
                this.browser = await chromium.launch({
                    headless: headless,
                    args: ['--disable-dev-shm-usage', '--no-sandbox']
                });
            }

            this.context = await this.browser.newContext({
                viewport: { width: 1440, height: 900 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            });
            this.page = await this.context.newPage();
        }

        await this.login(credentials);
    }

    /**
     * Perform login on HMIS portal with dynamic or environment credentials
     * Solves mathematical captcha automatically on every login attempt.
     */
    async login(credentials = null) {
        const username = credentials?.username || process.env.PORTAL_USERNAME;
        const password = credentials?.password || process.env.PORTAL_PASSWORD;
        const hospitalId = credentials?.hospitalId || process.env.PORTAL_HOSPITAL_ID || '19';

        if (!username || !password) {
            console.warn('⚠️ No credentials provided for login (neither dynamically nor in environment).');
            return false;
        }

        // 1. Navigate to Login Page
        console.log(`🔗 Navigating to login page: ${this.portalUrl}/login`);
        await this.page.goto(`${this.portalUrl}/login`, { waitUntil: 'domcontentloaded' });
        await this.page.waitForSelector(SELECTORS.LOGIN.USERNAME_INPUT, { timeout: 15000 });

        // 2. Select Hospital
        console.log(`🏥 Selecting Hospital ID: ${hospitalId}`);
        await this.page.selectOption(SELECTORS.LOGIN.HOSPITAL_SELECT, hospitalId.toString());

        // 3. Fill Credentials
        console.log(`👤 Entering credentials for user: ${username}`);
        await this.page.fill(SELECTORS.LOGIN.USERNAME_INPUT, username);
        await this.page.fill(SELECTORS.LOGIN.PASSWORD_INPUT, password);

        // 4. Solve Mathematical Captcha
        console.log('🧩 Solving math captcha...');
        await this.solveCaptcha();

        // 5. Submit Login Form
        console.log('🔑 Submitting login credentials...');
        await this.page.click(SELECTORS.LOGIN.SUBMIT_BTN);

        // 6. Check for Errors or Redirects
        try {
            await this.page.waitForURL(url => 
                url.pathname.includes('/settings') || 
                url.pathname.includes('/today') || 
                url.pathname.includes('/token') ||
                url.pathname.includes('/radiology'), 
                { timeout: 12000 }
            );
        } catch (err) {
            const errorElement = await this.page.$(SELECTORS.LOGIN.ERROR_BANNER);
            if (errorElement) {
                const errorText = await errorElement.textContent();
                throw new Error(`Login rejected by portal: ${errorText.trim()}`);
            }
            throw new Error('Login failed: Redirect timeout exceeded.');
        }

        console.log(`🔓 Authentication successful for user: ${username}`);

        // 7. Handle Post-Login Settings (if prompted)
        if (this.page.url().includes('/login/settings')) {
            await this.handleDepartmentSelection();
        }

        this.isLoggedIn = true;
        this.currentCredentials = { username, hospitalId };
        return true;
    }

    /**
     * Solves the mathematical captcha by parsing DOM inputs
     */
    async solveCaptcha() {
        const num1El = await this.page.$(SELECTORS.LOGIN.CAPTCHA_NUM1);
        const num2El = await this.page.$(SELECTORS.LOGIN.CAPTCHA_NUM2);

        if (num1El && num2El) {
            const num1 = parseInt(await num1El.getAttribute('value'), 10);
            const num2 = parseInt(await num2El.getAttribute('value'), 10);

            const formText = await this.page.locator('form').innerText();
            let symbol = '+';
            if (formText.includes('-')) symbol = '-';
            else if (formText.includes('×') || formText.includes('*')) symbol = '*';

            let answer = num1 + num2;
            if (symbol === '-') answer = num1 - num2;
            if (symbol === '*') answer = num1 * num2;

            console.log(`🧩 Captcha Parsed: ${num1} ${symbol} ${num2} = ${answer}`);
            await this.page.fill(SELECTORS.LOGIN.CAPTCHA_ANSWER, answer.toString());
        } else {
            throw new Error('Captcha input fields not found.');
        }
    }

    /**
     * Selects standard clinical departments and loads the dashboard
     */
    async handleDepartmentSelection() {
        console.log('🏥 Selecting clinical department and clinic role...');
        await this.page.waitForSelector(SELECTORS.DEPARTMENT.DEPT_SELECT, { timeout: 10000 });
        
        await this.page.selectOption(SELECTORS.DEPARTMENT.DEPT_SELECT, '1'); // OPD
        await this.page.waitForTimeout(1500);
        
        await this.page.selectOption(SELECTORS.DEPARTMENT.CLINIC_SELECT, '1503'); // Interventional Radiology
        await this.page.waitForTimeout(1000);

        await this.page.click(SELECTORS.DEPARTMENT.NEXT_BTN);
        await this.page.waitForURL(url => url.pathname.includes('/token') || url.pathname.includes('/today'), { timeout: 10000 });
        console.log('✅ Role configurations successfully set.');
    }

    /**
     * Ensure session is alive or re-login with target credentials
     */
    async ensureSession(credentials = null) {
        if (!this.browser || !this.page) {
            await this.initialize(credentials);
            return;
        }

        const reqUser = credentials?.username;
        // If a different user is requested dynamically, switch session
        if (reqUser && this.currentCredentials?.username && reqUser !== this.currentCredentials.username) {
            console.log(`🔄 Switching HMIS session from ${this.currentCredentials.username} to ${reqUser}...`);
            this.isLoggedIn = false;
            await this.login(credentials);
            return;
        }

        if (!this.isLoggedIn || this.page.url().includes('/login')) {
            console.log('🔄 Session expired or inactive, re-authenticating...');
            await this.login(credentials || this.currentCredentials);
        }
    }

    /**
     * Complete Radiology Draft Reporting Workflow
     * STRICTLY DRAFT ONLY — NEVER SUBMITS
     */
    async saveRadiologyDraft(payload) {
        const dynamicCreds = (payload.portalUsername && payload.portalPassword) ? {
            username: payload.portalUsername,
            password: payload.portalPassword,
            hospitalId: payload.portalHospitalId
        } : (payload.credentials || null);

        await this.ensureSession(dynamicCreds);
        const { mrn, accession, moduleId, technique, findings, impression, clinicalHistory, pgrName, consultantName } = payload;

        if (!mrn) {
            throw new Error('Missing patient MRN in radiology draft payload.');
        }

        console.log(`🩺 [Playwright Worker] Processing Radiology Draft for MRN: ${mrn}...`);

        // 1. Navigate to Radiology Proceeded Patients
        const worklistUrl = `${this.portalUrl}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
        if (!this.page.url().includes('/radiology/proceeded-patients')) {
            console.log(`🔗 Navigating to ${worklistUrl}`);
            await this.page.goto(worklistUrl, { waitUntil: 'networkidle' });
        }

        // 2. Search for Patient by Accession or MRN
        if (accession) {
            console.log(`🔍 Searching by Accession: ${accession}`);
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
        } else {
            console.log(`🔍 Searching by MRN: ${mrn}`);
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
        }
        const searchBtn = await this.page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
        if (searchBtn) {
            await searchBtn.click();
        } else {
            await this.page.keyboard.press('Enter');
        }
        await this.page.waitForTimeout(1500);
        await this.page.waitForLoadState('networkidle');

        // 3. Click "Add Result" for target patient / accession
        console.log('📋 Locating Add Result button for target patient...');
        let addResultBtn = null;
        if (accession) {
            addResultBtn = await this.page.$(`tr:has-text("${accession}") a[wire\\:click*="addSampleResult"]`);
        }
        if (!addResultBtn) {
            addResultBtn = await this.page.$(SELECTORS.RADIOLOGY.ADD_RESULT_BTN);
        }
        if (!addResultBtn) {
            throw new Error(`Patient MRN ${mrn} (Accession ${accession || 'N/A'}) not found or "Add Result" button is not visible in proceeded patients.`);
        }
        await addResultBtn.click();

        // 4. Wait for Modal #AddSampleResult to Appear
        console.log('⏳ Waiting for #AddSampleResult modal...');
        await this.page.waitForSelector(SELECTORS.RADIOLOGY.MODAL_CONTAINER, { state: 'visible', timeout: 15000 });

        // 5. Select Procedure Module if specified, or auto-match from CPT header
        if (moduleId) {
            console.log(`⚙️ Selecting Procedure Module: ${moduleId}`);
            await this.page.selectOption(SELECTORS.RADIOLOGY.MODULE_SELECT, moduleId.toString());
            console.log('⏳ Waiting for Livewire template loader to settle...');
            await this.page.waitForTimeout(2000);
            await this.page.waitForLoadState('networkidle');
        } else {
            console.log('🔍 Auto-matching module from CPT header...');
            const matchedMod = await this.autoMatchModuleFromModal();
            if (matchedMod) {
                console.log(`⚙️ Auto-selected module: ${matchedMod}`);
                await this.page.waitForTimeout(2000);
                await this.page.waitForLoadState('networkidle');
            }
        }

        // 6. Format Report Bodies with Attribution
        const pgr = pgrName || 'Resident Radiologist (PGR)';
        const consultant = consultantName || 'Consultant Radiologist';

        let reportHtml = '';
        if (technique) {
            reportHtml += `<p><strong>TECHNIQUE:</strong><br>${technique}</p>`;
        }
        reportHtml += `<p><strong>FINDINGS:</strong></p>${findings || 'No acute abnormality detected.'}`;
        reportHtml += `<br><p><strong>Reported By:</strong> ${pgr}<br><strong>Verified By:</strong> ${consultant}</p>`;

        const impressionHtml = `<p><strong>IMPRESSION:</strong></p>${impression || 'Study within normal limits.'}<br><p><strong>Attribution:</strong> ${pgr} | <strong>Verified:</strong> ${consultant}</p>`;

        // 7. Inject Content directly into TinyMCE & Textareas
        console.log('✍️ Injecting report findings and impression into TinyMCE...');
        await this.page.evaluate(({ rep, imp, hist }) => {
            // Update TinyMCE instances
            if (window.tinymce && window.tinymce.editors) {
                window.tinymce.editors.forEach(ed => {
                    const id = (ed.id || '').toLowerCase();
                    if (id.includes('report') && rep) { ed.setContent(rep); ed.save(); }
                    if (id.includes('impression') && imp) { ed.setContent(imp); ed.save(); }
                    if (id.includes('history') && hist) { ed.setContent(hist); ed.save(); }
                });
            }

            // Sync underlying textareas
            const textareas = document.querySelectorAll('#AddSampleResult textarea');
            textareas.forEach(ta => {
                const id = (ta.id || '').toLowerCase();
                if (id.includes('report') && rep) {
                    ta.value = rep.replace(/<[^>]+>/g, '\n');
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (id.includes('impression') && imp) {
                    ta.value = imp.replace(/<[^>]+>/g, '\n');
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (id.includes('history') && hist) {
                    ta.value = hist;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }, { rep: reportHtml, imp: impressionHtml, hist: clinicalHistory });

        // 8. Settlement Delay & Anti-Wipe Recheck
        await this.page.waitForTimeout(600);
        await this.page.evaluate(({ rep, imp }) => {
            if (window.tinymce && window.tinymce.editors) {
                window.tinymce.editors.forEach(ed => {
                    const id = (ed.id || '').toLowerCase();
                    if (id.includes('report') && rep) { ed.setContent(rep); ed.save(); }
                    if (id.includes('impression') && imp) { ed.setContent(imp); ed.save(); }
                });
            }
        }, { rep: reportHtml, imp: impressionHtml });

        // 9. Click Save Draft (STRICT SAFETY: NEVER SUBMIT)
        console.log('💾 Clicking Save Draft (testing safe)...');
        const saveDraftBtn = await this.page.$(SELECTORS.RADIOLOGY.SAVE_DRAFT_BTN);
        if (!saveDraftBtn) {
            throw new Error('Save Draft button [wire:click="save(\'save\')"] not found in modal.');
        }

        await saveDraftBtn.click();
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('networkidle');

        // 10. Audit Screenshot for Verification
        const screenshotFilename = `draft-${mrn}-${Date.now()}.png`;
        const screenshotPath = path.join(this.auditDir, screenshotFilename);
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`📸 Audit screenshot saved: ${screenshotPath}`);

        return {
            success: true,
            mrn,
            message: 'Radiology report successfully saved as Draft in HMIS.',
            auditScreenshot: screenshotFilename,
            savedAt: new Date().toISOString()
        };
    }

    /**
     * Auto-matches module from CPT in #AddSampleResult modal header
     */
    async autoMatchModuleFromModal() {
        return await this.page.evaluate(() => {
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

    /**
     * Sets a custom Date Range in HMIS worklist respecting the 30-day maximum restriction
     */
    async setWorklistDateRange(startDateStr, endDateStr) {
        console.log(`📅 Setting HMIS Date Range: ${startDateStr} to ${endDateStr}`);
        await this.page.evaluate(async ({ start, end }) => {
            const timeListSelect = document.querySelector('select[wire\\:model\\.defer="time_list"], select[name="time_list"]');
            if (timeListSelect && timeListSelect.value !== 'Date Range') {
                timeListSelect.value = 'Date Range';
                timeListSelect.dispatchEvent(new Event('change', { bubbles: true }));
                timeListSelect.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 1200));
            }
            const fromInput = document.querySelector('#from-date-datetimepicker');
            const toInput = document.querySelector('#to-date-datetimepicker');
            if (fromInput) fromInput.value = start;
            if (toInput) toInput.value = end;

            if (window.livewire) {
                window.livewire.emit('set-date-range', start, end);
            }
        }, { start: startDateStr, end: endDateStr });

        await this.page.waitForTimeout(1500);
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Search patient by MRN or Accession on Proceeded Patients worklist
     * Automatically attempts date range expansion if not found within 48h
     */
    async searchPatient(query = {}) {
        await this.ensureSession();
        if (!this.isLoggedIn) {
            throw new Error('Authentication required: Headless browser is not logged in. Please provide portal credentials in .env or via API.');
        }
        const { mrn, accession } = query;
        const worklistUrl = `${this.portalUrl}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
        await this.page.goto(worklistUrl, { waitUntil: 'networkidle' });

        if (accession) {
            console.log(`🔍 [Search] Querying worklist by Accession: ${accession}`);
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
        } else if (mrn) {
            console.log(`🔍 [Search] Querying worklist by MRN: ${mrn}`);
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
        }

        const searchBtn = await this.page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
        if (searchBtn) await searchBtn.click();
        else await this.page.keyboard.press('Enter');

        await this.page.waitForTimeout(1500);
        await this.page.waitForLoadState('networkidle');

        let records = await this.page.evaluate(extractWorklistRecords);
        
        // If 0 records on default 48h worklist, attempt automatic date range inference
        if (records.length === 0 && (mrn || accession)) {
            const dateHint = inferDateRangeFromAccession(accession);
            if (dateHint) {
                console.log(`💡 Inferred scan period from accession ${accession}: ${dateHint.year}-${dateHint.month}. Applying Date Range...`);
                await this.setWorklistDateRange(dateHint.startDate, dateHint.endDate);

                // Re-trigger search with inferred date range
                const sBtn = await this.page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
                if (sBtn) await sBtn.click();
                await this.page.waitForTimeout(1500);
                await this.page.waitForLoadState('networkidle');

                records = await this.page.evaluate(extractWorklistRecords);
                if (records.length > 0) {
                    return {
                        source: 'WORKLIST_DATE_RANGE',
                        inferredDateRange: dateHint,
                        count: records.length,
                        records
                    };
                }
            }

            console.log('ℹ️ Not found on proceeded worklist. Querying tracking list for lifecycle status...');
            return await this.trackReportStatus(query);
        }

        return {
            source: 'WORKLIST',
            count: records.length,
            records
        };
    }

    /**
     * End-to-end report lifecycle tracking via /radiology/tracking-list
     */
    async trackReportStatus(query = {}) {
        await this.ensureSession();
        if (!this.isLoggedIn) {
            throw new Error('Authentication required: Headless browser is not logged in. Please provide portal credentials in .env or via API.');
        }
        const { mrn, accession } = query;
        const trackingUrl = `${this.portalUrl}${SELECTORS.RADIOLOGY.TRACKING_URL}`;
        await this.page.goto(trackingUrl, { waitUntil: 'networkidle' });

        if (accession) {
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_ACCESSION, accession.trim());
        } else if (mrn) {
            await this.page.waitForSelector(SELECTORS.RADIOLOGY.SEARCH_MRN, { timeout: 10000 });
            await this.page.fill(SELECTORS.RADIOLOGY.SEARCH_MRN, mrn.trim());
        }

        const searchBtn = await this.page.$(SELECTORS.RADIOLOGY.SEARCH_BTN);
        if (searchBtn) await searchBtn.click();
        else await this.page.keyboard.press('Enter');

        await this.page.waitForTimeout(1500);
        await this.page.waitForLoadState('networkidle');

        const records = await this.page.evaluate(extractTrackingMilestones);
        return {
            source: 'TRACKING_LIST',
            count: records.length,
            records
        };
    }

    /**
     * Scrapes the active Proceeded Patients queue
     */
    async getRadiologyQueue() {
        await this.ensureSession();
        const worklistUrl = `${this.portalUrl}${SELECTORS.RADIOLOGY.WORKLIST_URL}`;
        await this.page.goto(worklistUrl, { waitUntil: 'networkidle' });
        return await this.page.evaluate(extractWorklistRecords);
    }

    /**
     * Shut down browser instance
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        this.isLoggedIn = false;
    }
}

module.exports = PortalProvider;
