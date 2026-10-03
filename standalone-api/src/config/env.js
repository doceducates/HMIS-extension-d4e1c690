/**
 * Environment Configuration
 */
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    PORT: process.env.PORT || process.env.GATEWAY_PORT || 8080,
    PORTAL_URL: process.env.PORTAL_URL || 'https://hmis.punjab.gov.pk',
    HEADLESS_MODE: process.env.HEADLESS_MODE !== 'false',
    DEFAULT_HOSPITAL_ID: process.env.PORTAL_HOSPITAL_ID || '19',
    DEFAULT_USERNAME: process.env.PORTAL_USERNAME || '',
    DEFAULT_PASSWORD: process.env.PORTAL_PASSWORD || '',
    API_SECRET_KEY: process.env.API_SECRET_KEY || '',
    SESSION_IDLE_TIMEOUT_MS: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS, 10) || (30 * 60 * 1000) // 30 mins
};
