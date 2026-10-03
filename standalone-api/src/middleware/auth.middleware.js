/**
 * Auth Middleware
 * Validates optional API secret key and extracts per-request HMIS credentials.
 */
const env = require('../config/env');
const { sendError } = require('../utils/response');

function authMiddleware(req, res, next) {
    // 1. API Secret Key Validation (if configured)
    if (env.API_SECRET_KEY) {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (token !== env.API_SECRET_KEY && req.path !== '/api/status' && req.path !== '/health') {
            return sendError(res, 'Unauthorized: Invalid or missing API_SECRET_KEY.', 401);
        }
    }

    // 2. Extract Dynamic HMIS Credentials for the request
    req.hmisCredentials = {
        username: req.headers['x-hmis-username'] || req.body?.portalUsername || req.body?.username || env.DEFAULT_USERNAME,
        password: req.headers['x-hmis-password'] || req.body?.portalPassword || req.body?.password || env.DEFAULT_PASSWORD,
        hospitalId: req.headers['x-hmis-hospital-id'] || req.body?.portalHospitalId || req.body?.hospitalId || env.DEFAULT_HOSPITAL_ID
    };

    next();
}

module.exports = authMiddleware;
