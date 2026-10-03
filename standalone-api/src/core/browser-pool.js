/**
 * Singleton Browser Pool
 * Manages the underlying Playwright Chromium instance.
 */
const { chromium } = require('playwright');
const env = require('../config/env');

class BrowserPool {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (!this.browser) {
            console.log(`🚀 [BrowserPool] Launching Playwright Chromium (Headless: ${env.HEADLESS_MODE})...`);
            try {
                this.browser = await chromium.launch({
                    headless: env.HEADLESS_MODE,
                    channel: 'chrome',
                    args: ['--disable-dev-shm-usage', '--no-sandbox']
                });
            } catch (chromeErr) {
                this.browser = await chromium.launch({
                    headless: env.HEADLESS_MODE,
                    args: ['--disable-dev-shm-usage', '--no-sandbox']
                });
            }
        }
        return this.browser;
    }

    async close() {
        if (this.browser) {
            console.log('🛑 [BrowserPool] Closing browser instance...');
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new BrowserPool();
