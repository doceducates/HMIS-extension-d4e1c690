/**
 * Standard API Response Envelope
 */
function sendSuccess(res, data = {}, message = 'Operation successful', statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
}

function sendError(res, error = 'An error occurred', statusCode = 500, details = null) {
    const errorMsg = typeof error === 'string' ? error : (error.message || 'Internal Server Error');
    return res.status(statusCode).json({
        success: false,
        error: errorMsg,
        ...(details ? { details } : {}),
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    sendSuccess,
    sendError
};
