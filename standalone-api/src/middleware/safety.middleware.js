/**
 * Strict Safety Invariant Middleware
 * Permanently guards against unintended report final submissions during testing.
 */
function safetyMiddleware(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        if (req.body.action === 'submit') {
            console.warn('[SAFETY INVARIANT] Intercepted `action: "submit"`. Coercing strictly to "save" (Draft Only).');
            req.body.action = 'save';
        }
    }
    next();
}

module.exports = safetyMiddleware;
