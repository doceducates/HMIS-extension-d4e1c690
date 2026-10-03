/**
 * Auth Controller
 */
const authService = require('./auth.service');
const { sendSuccess, sendError } = require('../../utils/response');

class AuthController {
    async login(req, res, next) {
        try {
            const credentials = req.hmisCredentials;
            if (!credentials.username || !credentials.password) {
                return sendError(res, 'Missing username or password in login request.', 400);
            }
            const data = await authService.login(credentials);
            return sendSuccess(res, data, `Successfully authenticated session for ${data.username}`);
        } catch (err) {
            next(err);
        }
    }

    async logout(req, res, next) {
        try {
            const sessionId = req.body?.sessionId || req.query?.sessionId || `${req.hmisCredentials.username}:${req.hmisCredentials.hospitalId}`;
            const success = await authService.logout(sessionId);
            return sendSuccess(res, { closed: success, sessionId }, 'Session terminated');
        } catch (err) {
            next(err);
        }
    }

    listSessions(req, res) {
        const sessions = authService.listActiveSessions();
        return sendSuccess(res, sessions, 'Active user sessions retrieved');
    }
}

module.exports = new AuthController();
