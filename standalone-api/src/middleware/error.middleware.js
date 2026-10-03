/**
 * Error Shielding Middleware
 */
const { sendError } = require('../utils/response');

function errorMiddleware(err, req, res, next) {
    console.error(`🔴 [API Error ${req.method} ${req.path}]`, err.message);
    const statusCode = err.status || err.statusCode || 500;
    return sendError(res, err.message || 'An unexpected error occurred during portal automation.', statusCode);
}

module.exports = errorMiddleware;
