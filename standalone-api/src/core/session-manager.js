/**
 * Multi-Tenant Session Manager
 * Manages isolated Playwright BrowserContexts for distinct HMIS user accounts.
 */
const browserPool = require('./browser-pool');
const CaptchaSolver = require('./captcha-solver');
const SELECTORS = require('../config/selectors');
const env = require('../config/env');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // key: "username:hospitalId" -> SessionObject
    }

    getKey(username, hospitalId) {
        return `${username || env.DEFAULT_USERNAME}:${hospitalId || env.DEFAULT_HOSPITAL_ID}`.toLowerCase();
    }

    /**
     * Retrieves an existing session or creates and authenticates a new one
     */
    async getSession(credentials = {}) {
        const username = credentials.username || env.DEFAULT_USERNAME;
        const password = credentials.password || env.DEFAULT_PASSWORD;
        const hospitalId = (credentials.hospitalId || env.DEFAULT_HOSPITAL_ID).toString();
        const key = this.getKey(username, hospitalId);

        let session = this.sessions.get(key);

        // Check if existing session is healthy
        if (session && session.isLoggedIn && !session.page.isClosed()) {
            session.lastActive = Date.now();
            return session;
        }

        // Otherwise create new isolated session
        if (!username || !password) {
            throw new Error(`Credentials required for user '${username}'. Provide username and password.`);
        }

        console.log(`🔐 [SessionManager] Initializing isolated session for '${key}'...`);
        const browser = await browserPool.getBrowser();
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        session = {
            id: key,
            username,
            hospitalId,
            context,
            page,
            isLoggedIn: false,
            createdAt: Date.now(),
            lastActive: Date.now(),
            lock: Promise.resolve()
        };

        await this.authenticate(session, password);
        this.sessions.set(key, session);
        return session;
    }

    /**
     * Executes login and captcha solving for a session
     */
    async authenticate(session, password) {
        const { page, username, hospitalId } = session;
        console.log(`🔗 [SessionManager] Navigating to ${env.PORTAL_URL}/login for ${username}`);
        await page.goto(`${env.PORTAL_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(SELECTORS.LOGIN.USERNAME_INPUT, { timeout: 15000 });

        await page.selectOption(SELECTORS.LOGIN.HOSPITAL_SELECT, hospitalId);
        await page.fill(SELECTORS.LOGIN.USERNAME_INPUT, username);
        await page.fill(SELECTORS.LOGIN.PASSWORD_INPUT, password);

        await CaptchaSolver.solve(page);
        await page.click(SELECTORS.LOGIN.SUBMIT_BTN);

        try {
            await page.waitForURL(url => 
                url.pathname.includes('/settings') || 
                url.pathname.includes('/today') || 
                url.pathname.includes('/token') ||
                url.pathname.includes('/radiology'), 
                { timeout: 15000 }
            );
        } catch (err) {
            const errorElement = await page.$(SELECTORS.LOGIN.ERROR_BANNER);
            if (errorElement) {
                const text = await errorElement.textContent();
                throw new Error(`Login rejected by HMIS: ${text.trim()}`);
            }
            throw new Error('Login failed: Redirect timeout exceeded.');
        }

        if (page.url().includes('/login/settings')) {
            await this.handleDepartmentSelection(page);
        }

        session.isLoggedIn = true;
        session.lastActive = Date.now();
        console.log(`🔓 [SessionManager] Successfully authenticated session: ${session.id}`);
    }

    async handleDepartmentSelection(page) {
        await page.waitForSelector(SELECTORS.DEPARTMENT.DEPT_SELECT, { timeout: 10000 });
        await page.selectOption(SELECTORS.DEPARTMENT.DEPT_SELECT, '1'); // OPD
        await page.waitForTimeout(1000);
        await page.selectOption(SELECTORS.DEPARTMENT.CLINIC_SELECT, '1503'); // Interventional Radiology
        await page.waitForTimeout(800);
        await page.click(SELECTORS.DEPARTMENT.NEXT_BTN);
        await page.waitForURL(url => url.pathname.includes('/token') || url.pathname.includes('/today'), { timeout: 10000 });
    }

    /**
     * Queues an exclusive action on the session's page to prevent concurrency collision
     */
    async withSession(credentials, actionFn) {
        const session = await this.getSession(credentials);
        const result = await (session.lock = session.lock.then(async () => {
            session.lastActive = Date.now();
            return await actionFn(session.page, session);
        }));
        return result;
    }

    listSessions() {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            username: s.username,
            hospitalId: s.hospitalId,
            isLoggedIn: s.isLoggedIn,
            ageSeconds: Math.round((Date.now() - s.createdAt) / 1000),
            idleSeconds: Math.round((Date.now() - s.lastActive) / 1000)
        }));
    }

    async closeSession(key) {
        const session = this.sessions.get(key.toLowerCase());
        if (session) {
            await session.context.close();
            this.sessions.delete(key.toLowerCase());
            return true;
        }
        return false;
    }

    async closeAll() {
        for (const [key, session] of this.sessions.entries()) {
            await session.context.close();
        }
        this.sessions.clear();
        await browserPool.close();
    }
}

module.exports = new SessionManager();
